/* Pace Calendar: shared goals transport (build 39).
   A shared goal lives OUTSIDE every user's private state: one
   goal doc at sharedGoals/{id} plus one doc per step at
   sharedGoals/{id}/steps/{sid}. The goal doc id is a long
   random string — it is the share link's secret. The Security
   Rules (v2.6) are the wall: the goal doc's member map is
   fenced by the one-diff equality, and every step doc fences
   its own write — the status triple moves only for the step's
   stored assignee, with credit bound to the caller (the
   F-P39-1 cure: steps were a list inside the goal doc in
   v2.5, and a list cannot fence one element's write).
   This layer assembles the two storeys into the single doc
   shape the screens consume, and act() diffs an edit back
   into per-step writes plus (only when goal fields moved) one
   goal-doc write. Pure transport — the screens and the
   dividing maths live in goals-ui.js and sharing-ui.js. */
(function (root) {
  "use strict";
  var FB = root.PaceFB || null;

  function fb() { return root.PaceFB || FB; }
  function myUid() { var s = fb() && fb().session(); return s ? s.uid : null; }
  function path(id) { return "sharedGoals/" + id; }
  function stepsPath(id) { return path(id) + "/steps"; }
  function stepPath(id, sid) { return stepsPath(id) + "/" + sid; }

  var ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function newId() {
    var out = "", buf = new Uint8Array(22);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(buf);
    else for (var i = 0; i < 22; i++) buf[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < 22; j++) out += ALPHABET[buf[j] % ALPHABET.length];
    return out;
  }

  function shareLink(id) { return "https://adhd-calendar-app-beta.vercel.app/?join=" + id; }

  /* The stored shape of one step doc. createdBy is stamped at
     birth and never moves (rules Addendum 2: immutable in
     every arm). */
  function stepBody(s, callerUid) {
    return {
      title: s.title, date: s.date, time: s.time != null ? s.time : null,
      durationMin: s.durationMin || 20,
      minVersion: s.minVersion == null ? null : String(s.minVersion),
      assignee: s.assignee || null,
      status: s.status === "done" ? "done" : "todo",
      doneBy: s.doneBy || null,
      doneAt: s.doneAt != null ? s.doneAt : null,
      createdBy: s.createdBy || callerUid
    };
  }
  function stepFieldsDiffer(a, b) {
    var keys = ["title", "date", "time", "durationMin", "minVersion", "assignee", "status", "doneBy", "doneAt", "createdBy"];
    for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (String(a[k]) !== String(b[k])) return true; }
    return false;
  }

  /* Create the goal doc + its step docs. doc arrives without
     id/owner fields filled; the caller is the owner and the
     first member. Steps are BORN OPEN (the rules fence: status
     'todo', doneBy/doneAt null) — a step the plan already shows
     done is ticked in right after its birth, by its assignee,
     through the same status fence everyone else uses. */
  function create(doc) {
    var uid = myUid();
    if (!uid) return Promise.reject(new Error("Not signed in."));
    doc.id = newId();
    doc.ownerUid = uid;
    // Members are a uid-keyed MAP (Security v2.5 ruling R1): the
    // rules can then prove join/leave/own-entry edits with one
    // equality — the map without the caller's key, unchanged.
    if (!doc.members || typeof doc.members !== "object" || Array.isArray(doc.members)) doc.members = {};
    if (!doc.members[uid]) doc.members[uid] = { name: String(doc.ownerName || "").slice(0, 100), focus: "" };
    delete doc.memberUids;
    doc.createdAt = Date.now();
    doc.updatedAt = Date.now();
    var id = doc.id, steps = (doc.steps || []).slice();
    var body = {};
    Object.keys(doc).forEach(function (k) { if (k !== "id" && k !== "steps") body[k] = doc[k]; });
    body.stepCount = steps.length;
    return fb().fsSet(path(id), body).then(function () {
      var chain = Promise.resolve();
      steps.forEach(function (s) {
        var born = stepBody(s, uid);
        var wantDone = born.status === "done";
        born.status = "todo"; born.doneBy = null; born.doneAt = null;
        chain = chain.then(function () { return fb().fsSet(stepPath(id, s.sid), born); }).then(function () {
          if (!wantDone) return null;
          var done = stepBody(s, uid);
          done.doneAt = Date.now();
          return fb().fsSet(stepPath(id, s.sid), done);
        });
      });
      return chain;
    }).then(function () { doc.stepCount = steps.length; return doc; });
  }

  /* Read a shared goal by id (the link): the goal doc, plus —
     for members — its step docs, assembled into the one doc
     shape the screens consume. A non-member reads the goal doc
     alone (title, names, stepCount for the join sheet); the
     step bodies are members-only under the rules. Returns the
     doc with its id attached, or null when it does not exist. */
  function get(id) {
    if (!id) return Promise.resolve(null);
    return fb().fsGet(path(id)).then(function (o) {
      if (!o) return null;
      o.id = id;
      var uid = myUid();
      if (!uid || !o.members || !o.members[uid]) {
        o.steps = [];
        Object.defineProperty(o, "_stepsLoaded", { value: false });
        return o;
      }
      Object.defineProperty(o, "_stepsLoaded", { value: true });
      return fb().fsList(stepsPath(id)).then(function (rows) {
        o.steps = (rows || []).map(function (r) {
          var s = {}; Object.keys(r).forEach(function (k) { if (k !== "_id") s[k] = r[k]; });
          s.sid = r._id;
          return s;
        }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.sid < b.sid ? -1 : 1; });
        o.stepCount = o.steps.length;
        return o;
      });
    });
  }

  /* One edit round. fn(doc) mutates the assembled doc in place
     and may return false to cancel every write. The diff back:
     changed/new step docs are written FIRST (a leaver is still
     a member while their own steps fall back to the pool),
     removed step docs are deleted, and the goal doc is written
     only when a goal-level field moved or the step count
     changed (a bare tick never touches the goal doc). */
  function act(id, fn) {
    var uid = myUid();
    return get(id).then(function (doc) {
      if (!doc) throw new Error("That goal could not be found.");
      var before = {};
      (doc.steps || []).forEach(function (s) { before[s.sid] = stepBody(s, uid); });
      var beforeBody = {};
      // Deep copies: fn mutates doc in place, and a reference
      // snapshot would mutate along with it (the members map
      // above all) and hide the change from the diff.
      Object.keys(doc).forEach(function (k) { if (k !== "id" && k !== "steps") beforeBody[k] = JSON.parse(JSON.stringify(doc[k])); });
      if (fn(doc) === false) return doc;
      var after = {};
      (doc.steps || []).forEach(function (s) { after[s.sid] = s; });
      var writes = [], deletes = [], structural = false;
      Object.keys(after).forEach(function (sid) {
        var nb = stepBody(after[sid], uid);
        if (!before[sid]) { writes.push([sid, nb]); structural = true; }
        else if (stepFieldsDiffer(before[sid], nb)) writes.push([sid, nb]);
      });
      Object.keys(before).forEach(function (sid) { if (!after[sid]) { deletes.push(sid); structural = true; } });
      var body = {};
      Object.keys(doc).forEach(function (k) { if (k !== "id" && k !== "steps") body[k] = doc[k]; });
      // The count restamps only from a steps-loaded read; an
      // unloaded read (a joiner's first touch) keeps the
      // stored count rather than zeroing it.
      body.stepCount = doc._stepsLoaded ? (doc.steps || []).length : beforeBody.stepCount;
      var docChanged = structural;
      if (!docChanged) {
        var keys = {};
        Object.keys(beforeBody).forEach(function (k) { keys[k] = 1; });
        Object.keys(body).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) { if (JSON.stringify(beforeBody[k]) !== JSON.stringify(body[k])) docChanged = true; });
      }
      var chain = Promise.resolve();
      writes.forEach(function (w) { chain = chain.then(function () { return fb().fsSet(stepPath(id, w[0]), w[1]); }); });
      deletes.forEach(function (sid) { chain = chain.then(function () { return fb().fsDelete(stepPath(id, sid)); }); });
      if (docChanged) {
        doc.updatedAt = Date.now();
        body.updatedAt = doc.updatedAt;
        chain = chain.then(function () { return fb().fsSet(path(id), body); });
      }
      doc.stepCount = body.stepCount;
      return chain.then(function () { return doc; });
    });
  }

  function isMember(doc, uid) { return !!doc && !!doc.members && !!doc.members[uid || myUid()]; }

  /* The join: adds the caller (and only the caller) as a member.
     Resolves { doc, joined } — joined false when already in. */
  function join(id, name) {
    var uid = myUid();
    if (!uid) return Promise.reject(new Error("Not signed in."));
    var joined = false;
    return act(id, function (doc) {
      if (doc.closed) throw new Error("This goal is closed to new people.");
      if (isMember(doc, uid)) return;
      if (!doc.members || typeof doc.members !== "object") doc.members = {};
      doc.members[uid] = { name: String(name || "").slice(0, 100), focus: "" };
      joined = true;
    }).then(function (doc) {
      if (!joined) return { doc: doc, joined: joined };
      // Re-read as a member so the returned doc carries the
      // steps (the join write itself was made from an
      // unloaded read).
      return get(id).then(function (fresh) { return { doc: fresh || doc, joined: joined }; });
    });
  }

  /* Leave: removes the caller from the member list. The owner
     cannot leave their own goal (they stop sharing instead).
     My open steps fall back to the pool for the others — the
     act diff writes them before the membership goes. */
  function leave(id) {
    var uid = myUid();
    if (!uid) return Promise.reject(new Error("Not signed in."));
    return act(id, function (doc) {
      if (doc.ownerUid === uid) return false;
      if (doc.members) delete doc.members[uid];
      (doc.steps || []).forEach(function (s) {
        if (s.assignee === uid && s.status !== "done") s.assignee = null;
      });
    });
  }

  /* Destroy: the step docs go first, then the goal doc (the
     owner's teardown; the account-deletion sweep rides it). */
  function destroy(id) {
    return fb().fsList(stepsPath(id)).catch(function () { return []; }).then(function (rows) {
      var chain = Promise.resolve();
      (rows || []).forEach(function (r) { chain = chain.then(function () { return fb().fsDelete(stepPath(id, r._id)); }); });
      return chain;
    }).then(function () { return fb().fsDelete(path(id)); });
  }

  var api = { newId: newId, shareLink: shareLink, create: create, get: get, act: act, join: join, leave: leave, destroy: destroy, isMember: isMember, myUid: myUid };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PaceShare = api;
})(typeof window !== "undefined" ? window : globalThis);
