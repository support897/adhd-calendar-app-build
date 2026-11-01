/* Pace Calendar: shared goals screens (build 39).
   Owner side: the share sheet on a goal card — create the link,
   write what each person is best at, divide the tasks fairly
   (by strengths, or half and half), share them out.
   Member side: the "Shared with you" cards on the Goals screen.
   Transport lives in sharing.js; the goal maths in goals.js. */
(function () {
  "use strict";
  var C = window.PaceCtx, S = window.PaceShare, L = window.CalmLogic, tr = window.t;
  if (!C || !S) return;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function myUid() { return S.myUid(); }
  function myName() {
    var s = (C.state.settings || {});
    if (s.profileName) return s.profileName;
    var sess = window.PaceFB && window.PaceFB.session();
    return (sess && sess.email ? sess.email.split("@")[0] : "") || tr("Me");
  }
  function niceDate(k) {
    if (!k) return "";
    var p = String(k).split("-"), d = new Date(+p[0], p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
  function ensureSharedIds() { if (!Array.isArray(C.state.sharedGoalIds)) C.state.sharedGoalIds = []; return C.state.sharedGoalIds; }
  function memberName(doc, uid) {
    var m = (doc.members || {})[uid];
    if (!m) return tr("Someone");
    return uid === myUid() ? tr("You") : (m.name || tr("Someone"));
  }
  /* Members live in a uid-keyed map (Security v2.5 R1); screens
     want a list — this is the one bridge. */
  function memberList(doc) {
    var mm = doc.members || {};
    return Object.keys(mm).map(function (uid) { return { uid: uid, name: mm[uid].name || "", focus: mm[uid].focus || "" }; });
  }

  /* ---------- the divide ----------
     Open steps only; done steps never move. "strengths": a step
     goes to the person whose focus words match its title best;
     no match (or "even"): the step goes to whoever has the
     fewest minutes so far, so it always stays fair. */
  var STOP = { the: 1, and: 1, for: 1, your: 1, you: 1, one: 1, this: 1, that: 1, with: 1, from: 1, into: 1, step: 1, steps: 1, all: 1, get: 1, put: 1, out: 1, per: 1, day: 1 };
  function tokens(text) {
    return String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && !STOP[w]; });
  }
  function divideSteps(steps, members, mode) {
    var out = {}, mins = {};
    (members || []).forEach(function (m) { mins[m.uid] = 0; });
    (steps || []).forEach(function (s) { if (s.status === "done" && s.assignee && mins[s.assignee] != null) mins[s.assignee] += s.durationMin || 0; });
    function fewest() {
      var best = null;
      (members || []).forEach(function (m) { if (best === null || mins[m.uid] < mins[best]) best = m.uid; });
      return best;
    }
    var open = (steps || []).filter(function (s) { return s.status !== "done"; }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    open.forEach(function (s) {
      var pick = null;
      if (mode === "strengths") {
        var title = tokens(s.title), bestScore = 0;
        (members || []).forEach(function (m) {
          var score = 0, ft = tokens(m.focus);
          ft.forEach(function (w) { if (title.indexOf(w) >= 0) score++; });
          if (score > bestScore || (score === bestScore && score > 0 && pick && mins[m.uid] < mins[pick])) { bestScore = score; pick = m.uid; }
        });
        if (!bestScore) pick = null;
      }
      if (!pick) pick = fewest();
      if (pick) { out[s.sid] = pick; mins[pick] += s.durationMin || 0; }
      else out[s.sid] = null;
    });
    return out;
  }

  /* After a divide, my own calendar keeps only my steps. Steps
     given to others (or left in the pool) leave my calendar —
     they live in the shared goal and on the other calendars. */
  function applyAssignmentsToMine(doc) {
    var me = myUid();
    var goal = (C.state.goals || []).filter(function (g) { return g.sharedGoalId === doc.id; })[0];
    if (!goal) return;
    var bySid = {};
    (doc.steps || []).forEach(function (s) { bySid[s.sid] = s; });
    C.state.tasks = C.state.tasks.filter(function (t) {
      if (t.goalId !== goal.id) return true;
      var st = bySid[t.id];
      if (!st) return true; // a task I added myself after sharing: mine, untouched
      t.sharedGoalId = doc.id; t.sharedStepId = st.sid;
      if (st.status === "done") return true; // history stays with whoever did it
      return st.assignee === me;
    });
    C.save();
  }

  /* ---------- the share sheet ---------- */
  var cur = null; // { goal, doc, mode, preview }
  function openShare(goal) {
    cur = { goal: goal, doc: null, mode: "strengths", preview: null };
    var sheet = $("shareSheet"); if (!sheet) return;
    sheet.hidden = false;
    renderShareBody();
    if (goal.sharedGoalId) {
      S.get(goal.sharedGoalId).then(function (doc) {
        if (!cur || cur.goal !== goal) return;
        cur.doc = doc; cur.mode = (doc && doc.splitMode) || "strengths";
        renderShareBody();
      }).catch(function () { if (cur) { cur.doc = null; cur.loadFailed = true; renderShareBody(); } });
    }
  }
  function closeShare() { var sheet = $("shareSheet"); if (sheet) sheet.hidden = true; cur = null; }

  function renderShareBody() {
    var body = $("sgBody"); if (!body || !cur) return;
    body.innerHTML = "";
    var goal = cur.goal;
    body.appendChild(el("p", "sg-goal", goal.title));
    if (!goal.sharedGoalId) {
      body.appendChild(el("p", "hint", tr("Share this goal with one person, or a few. They get a link. When they join, the goal's steps can be divided between everyone, and you all see the same progress.")));
      var mk = el("button", "primary-btn", tr("Create share link"), { type: "button", id: "sgCreate" });
      mk.addEventListener("click", function () { mk.disabled = true; createShare(goal, mk); });
      body.appendChild(mk);
      return;
    }
    if (cur.loadFailed) { body.appendChild(el("p", "hint", tr("That shared goal could not be loaded. Check your connection and try again."))); return; }
    if (!cur.doc) { body.appendChild(el("p", "hint", tr("Loading…"))); return; }
    var doc = cur.doc;
    if (doc.closed) body.appendChild(el("p", "hint", tr("Sharing is stopped for this goal. People keep the tasks already on their calendars.")));
    // the link
    body.appendChild(el("span", "gf-label", tr("Send this link to your people")));
    var row = el("div", "sg-linkrow");
    var inp = el("input", null, null, { type: "text", readonly: "readonly", value: S.shareLink(doc.id), id: "sgLink", "aria-label": tr("Share link") });
    var cp = el("button", "soft-btn", tr("Copy link"), { type: "button", id: "sgCopy" });
    cp.addEventListener("click", function () {
      var done = function () { C.toast(tr("Link copied.")); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); });
      else { inp.select(); try { document.execCommand("copy"); done(); } catch (e) {} }
    });
    row.appendChild(inp); row.appendChild(cp);
    body.appendChild(row);
    body.appendChild(el("p", "hint", tr("Anyone with the link and a Pace account can join this goal.")));
    if (doc.ownerUid !== myUid()) { renderMemberSheet(body, doc); return; }
    renderOwnerSheet(body, doc);
  }

  function createShare(goal, btn) {
    var me = myUid();
    var steps = C.state.tasks.filter(function (t) { return t.goalId === goal.id; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
      .map(function (t) {
        return { sid: t.id, title: t.title, date: t.date, time: t.time || null, durationMin: t.durationMin || 20, minVersion: t.minVersion || "",
          assignee: t.status === "done" ? me : null, status: t.status === "done" ? "done" : "todo", doneBy: t.status === "done" ? me : null, doneAt: null };
      });
    if (!steps.length) { C.toast(tr("Add the plan first, then share it.")); if (btn) btn.disabled = false; return; }
    var mm = {}; mm[me] = { name: myName(), focus: "" };
    S.create({
      title: goal.title, category: goal.category, end: goal.end, closed: false, splitMode: "strengths",
      ownerName: myName(), members: mm, steps: steps,
    }).then(function (doc) {
      goal.sharedGoalId = doc.id;
      var ids = ensureSharedIds(); if (ids.indexOf(doc.id) < 0) ids.push(doc.id);
      C.save();
      if (cur && cur.goal === goal) { cur.doc = doc; renderShareBody(); }
      C.toast(tr("Share link ready. Send it to your people."));
      if (window.renderGoals) window.renderGoals(true);
    }).catch(function () { C.toast(tr("Sharing did not start. Check your connection and try again.")); if (btn) btn.disabled = false; });
  }

  function renderOwnerSheet(body, doc) {
    // people + focus words
    body.appendChild(el("span", "gf-label", tr("People in this goal")));
    memberList(doc).forEach(function (m) {
      var row = el("div", "sg-member");
      var doneN = (doc.steps || []).filter(function (s) { return s.status === "done" && s.doneBy === m.uid; }).length;
      row.appendChild(el("span", "sg-name", memberName(doc, m.uid) + (doneN ? " · " + tr("{n} done", { n: doneN }) : "")));
      var f = el("input", null, null, { type: "text", maxlength: "120", value: m.focus || "", "data-focus-uid": m.uid,
        placeholder: tr("Best at… e.g. money and numbers"), "aria-label": tr("What is this person best at?") });
      row.appendChild(f);
      body.appendChild(row);
    });
    if (memberList(doc).length < 2) body.appendChild(el("p", "hint", tr("Just you so far. When your people join with the link, they will show up here.")));
    // the split picker
    body.appendChild(el("span", "gf-label", tr("How should Pace divide the tasks?")));
    var pick = el("div", "gf-cats", null, { role: "radiogroup", "aria-label": tr("How should Pace divide the tasks?") });
    [["strengths", tr("By what each person is best at")], ["even", tr("Half and half")]].forEach(function (o) {
      var b = el("button", "gf-cat" + (cur.mode === o[0] ? " is-on" : ""), o[1], { type: "button", role: "radio", "aria-checked": String(cur.mode === o[0]), "data-mode": o[0] });
      b.addEventListener("click", function () {
        cur.mode = o[0]; cur.preview = null;
        pick.querySelectorAll(".gf-cat").forEach(function (x) { var on = x.getAttribute("data-mode") === cur.mode; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", String(on)); });
        var pv = $("sgPreview"); if (pv) pv.innerHTML = "";
      });
      pick.appendChild(b);
    });
    body.appendChild(pick);
    var acts = el("div", "gf-actions");
    var div = el("button", "primary-btn", tr("Divide the tasks"), { type: "button", id: "sgDivide" });
    div.addEventListener("click", function () { showPreview(body, doc); });
    acts.appendChild(div);
    body.appendChild(acts);
    var pv = el("div", null, null, { id: "sgPreview" });
    body.appendChild(pv);
    // stop sharing
    var stop = el("button", "soft-btn danger", tr(doc.closed ? "Sharing stopped" : "Stop sharing"), { type: "button", id: "sgStop" });
    if (doc.closed) stop.disabled = true;
    stop.addEventListener("click", function () {
      stop.textContent = tr("Tap again to stop sharing");
      stop.addEventListener("click", function () {
        S.act(doc.id, function (d) { d.closed = true; }).then(function (d2) {
          cur.doc = d2;
          var g = (C.state.goals || []).filter(function (x) { return x.sharedGoalId === doc.id; })[0];
          if (g) delete g.sharedGoalId;
          C.state.tasks.forEach(function (t) { if (t.sharedGoalId === doc.id) { delete t.sharedGoalId; delete t.sharedStepId; } });
          C.save(); renderShareBody();
          if (window.renderGoals) window.renderGoals(true);
          C.toast(tr("Sharing stopped. The tasks on each calendar stay there."));
        }).catch(function () { C.toast(tr("That did not work. Try again.")); });
      }, { once: true });
    });
    body.appendChild(stop);
  }

  function readPeople(body, doc) {
    var focus = {};
    body.querySelectorAll("[data-focus-uid]").forEach(function (i) { focus[i.getAttribute("data-focus-uid")] = i.value.trim().slice(0, 120); });
    return focus;
  }

  function showPreview(body, doc) {
    var focus = readPeople(body, doc);
    var members = memberList(doc).map(function (m) { return { uid: m.uid, name: m.name, focus: focus[m.uid] != null ? focus[m.uid] : (m.focus || "") }; });
    var plan = divideSteps(doc.steps, members, cur.mode);
    cur.preview = { plan: plan, focus: focus };
    var pv = $("sgPreview"); if (!pv) return;
    pv.innerHTML = "";
    pv.appendChild(el("span", "gf-label", tr("Here is who gets what")));
    var byUid = {};
    Object.keys(plan).forEach(function (sid) { var u = plan[sid]; if (u) { byUid[u] = byUid[u] || []; byUid[u].push(sid); } });
    members.forEach(function (m) {
      var mine = byUid[m.uid] || [];
      var mins = mine.reduce(function (a, sid) { var s = doc.steps.filter(function (x) { return x.sid === sid; })[0]; return a + (s ? s.durationMin || 0 : 0); }, 0);
      pv.appendChild(el("p", "sg-planline", memberName(doc, m.uid) + ": " + tr("{n} steps, about {m} minutes", { n: mine.length, m: mins })));
    });
    var pool = (doc.steps || []).filter(function (s) { return s.status !== "done" && !plan[s.sid]; }).length;
    if (pool) pv.appendChild(el("p", "hint", tr("{n} steps stay up for grabs.", { n: pool })));
    var go = el("button", "primary-btn", tr("Yes, share them out"), { type: "button", id: "sgShareOut" });
    go.addEventListener("click", function () { go.disabled = true; shareOut(doc, go); });
    pv.appendChild(go);
  }

  function shareOut(doc, btn) {
    var pv = cur.preview; if (!pv) return;
    S.act(doc.id, function (d) {
      d.splitMode = cur.mode;
      Object.keys(d.members || {}).forEach(function (uid) { if (pv.focus[uid] != null) d.members[uid].focus = pv.focus[uid]; });
      (d.steps || []).forEach(function (s) { if (s.status !== "done" && pv.plan[s.sid] !== undefined) s.assignee = pv.plan[s.sid]; });
    }).then(function (d2) {
      cur.doc = d2;
      applyAssignmentsToMine(d2);
      C.toast(tr("Shared out. Each person's steps are on their calendar."));
      closeShare();
      if (window.renderGoals) window.renderGoals(true);
    }).catch(function () { C.toast(tr("That did not work. Try again.")); if (btn) btn.disabled = false; });
  }

  /* ---------- member side (sheet view; cards are Phase C) ---------- */
  function renderMemberSheet(body, doc) {
    body.appendChild(el("p", "hint", tr("Shared by {name}", { name: doc.ownerName || tr("Someone") })));
    var done = (doc.steps || []).filter(function (s) { return s.status === "done"; }).length;
    body.appendChild(el("p", "sg-planline", tr("{a} of {b} steps done", { a: done, b: (doc.steps || []).length })));
    memberList(doc).forEach(function (m) {
      var n = (doc.steps || []).filter(function (s) { return s.status === "done" && s.doneBy === m.uid; }).length;
      body.appendChild(el("p", "sg-planline", memberName(doc, m.uid) + ": " + tr("{n} done", { n: n })));
    });
  }

  /* ---------- sync: the shared doc is the team's truth ----------
     My calendar holds copies of my steps. Sync makes the copies
     match the doc: steps given to me appear, steps that moved to
     someone else leave, ticks follow the doc. My own ticks write
     to the doc first (onLocalTick), so doc and copies agree. */
  var docCache = {}, fetching = {};
  function stepTimeForMe(step) {
    if (!step.time) return null;
    var p = String(step.time).split(":"), s0 = (+p[0]) * 60 + (+p[1] || 0), clash = false;
    C.state.tasks.forEach(function (t) {
      if (!t || t.date !== step.date || !t.time || t.status === "done") return;
      var q = String(t.time).split(":"), a = (+q[0]) * 60 + (+q[1] || 0);
      if (s0 < a + Math.max(5, t.durationMin || 25) && s0 + (step.durationMin || 20) > a) clash = true;
    });
    return clash ? null : step.time;
  }
  function materialize(doc, step) {
    var cat = window.PaceGoals ? window.PaceGoals.goalCategory(doc.category) : { color: "#5B6BD5", emoji: "👥" };
    return { id: step.sid, title: step.title, date: step.date, time: stepTimeForMe(step), durationMin: step.durationMin || 20,
      priority: 0, repeat: null, category: "other", color: cat.color, icon: cat.emoji, essential: false,
      status: step.status === "done" ? "done" : "todo", done: step.status === "done",
      steps: [], minVersion: step.minVersion || "", fullVersion: "", source: "shared", goalId: null,
      sharedGoalId: doc.id, sharedStepId: step.sid, remind: [10], originalText: doc.title, skipDates: [], doneDates: [] };
  }
  function syncSharedGoal(doc) {
    var me = myUid(), changed = false;
    if (!me || !doc) return false;
    if (doc.closed) {
      C.state.tasks.forEach(function (t) { if (t.sharedGoalId === doc.id) { delete t.sharedGoalId; delete t.sharedStepId; t.source = "typed"; changed = true; } });
      if (doc.ownerUid !== me) C.state.sharedGoalIds = ensureSharedIds().filter(function (i) { return i !== doc.id; });
      if (changed) C.save();
      return changed;
    }
    var mine = {};
    C.state.tasks.forEach(function (t) { if (t.sharedGoalId === doc.id) mine[t.sharedStepId] = t; });
    var seen = {};
    (doc.steps || []).forEach(function (step) {
      seen[step.sid] = true;
      var local = mine[step.sid];
      if (step.assignee === me) {
        if (!local) { C.state.tasks.push(materialize(doc, step)); changed = true; }
        else {
          if (local.title !== step.title || local.date !== step.date) { local.title = step.title; local.date = step.date; changed = true; }
          var wantDone = step.status === "done";
          if ((local.status === "done") !== wantDone) { local.status = wantDone ? "done" : "todo"; local.done = wantDone; changed = true; }
        }
      } else if (local && local.status !== "done") {
        C.state.tasks = C.state.tasks.filter(function (x) { return x !== local; });
        changed = true;
      }
    });
    Object.keys(mine).forEach(function (sid) {
      if (!seen[sid] && mine[sid].status !== "done") { C.state.tasks = C.state.tasks.filter(function (x) { return x !== mine[sid]; }); changed = true; }
    });
    if (changed) C.save();
    return changed;
  }
  function refreshShared(id, rerender) {
    return S.get(id).then(function (doc) {
      if (!doc) return null;
      docCache[id] = doc;
      syncSharedGoal(doc);
      if (rerender && window.renderGoals) window.renderGoals();
      return doc;
    }).catch(function () { return null; });
  }
  function onLocalTick(t) {
    if (!t || !t.sharedGoalId || !t.sharedStepId) return;
    var id = t.sharedGoalId, sid = t.sharedStepId, me = myUid();
    S.act(id, function (d) {
      var s = (d.steps || []).filter(function (x) { return x.sid === sid; })[0];
      if (!s) return false;
      s.status = t.status === "done" ? "done" : "todo";
      s.doneBy = s.status === "done" ? me : null;
      s.doneAt = s.status === "done" ? Date.now() : null;
    }).then(function (d) {
      docCache[id] = d;
      if (window.renderGoals) window.renderGoals();
    }).catch(function () { C.toast(tr("That tick could not be shared yet. It will try again when you are back online.")); });
  }

  /* ---------- joining ---------- */
  var JOIN_KEY = "pace-pending-join", joinOpen = false;
  function pendingJoin() { try { return localStorage.getItem(JOIN_KEY); } catch (e) { return null; } }
  function setPendingJoin(id) { try { if (id) localStorage.setItem(JOIN_KEY, id); else localStorage.removeItem(JOIN_KEY); } catch (e) {} }
  function parseJoin(text) {
    var s = String(text || "");
    var m = s.match(/[?&]join=([A-Za-z0-9]{16,})/) || s.match(/^\s*([A-Za-z0-9]{16,})\s*$/);
    return m ? m[1] : null;
  }
  function openJoin(id) {
    var sheet = $("joinSheet"); if (!sheet || joinOpen) return;
    joinOpen = true; sheet.hidden = false;
    var body = $("joinBody"); body.innerHTML = "";
    body.appendChild(el("p", "hint", tr("Loading…")));
    S.get(id).then(function (doc) { if (joinOpen) renderJoinBody(id, doc); })
      .catch(function () { if (joinOpen) renderJoinBody(id, null); });
  }
  function closeJoin() { var sheet = $("joinSheet"); if (sheet) sheet.hidden = true; joinOpen = false; }
  function renderJoinBody(id, doc) {
    var body = $("joinBody"); if (!body) return;
    body.innerHTML = "";
    var notNow = el("button", "soft-btn", tr("Not now"), { type: "button" });
    notNow.addEventListener("click", function () { setPendingJoin(null); closeJoin(); });
    if (!doc) {
      body.appendChild(el("p", "hint", tr("That link did not find a goal. It may have been removed.")));
      body.appendChild(notNow); return;
    }
    body.appendChild(el("p", "sg-goal", doc.title));
    body.appendChild(el("p", "hint", tr("Shared by {name}", { name: doc.ownerName || tr("Someone") }) + " · " + tr("{n} steps", { n: doc.stepCount != null ? doc.stepCount : (doc.steps || []).length })));
    var me = myUid();
    if (doc.members && doc.members[me]) {
      body.appendChild(el("p", "hint", tr("You are already in this goal.")));
      var see = el("button", "primary-btn", tr("See my goals"), { type: "button" });
      see.addEventListener("click", function () { setPendingJoin(null); closeJoin(); if (window.renderGoals) window.renderGoals(true); });
      body.appendChild(see); body.appendChild(notNow); return;
    }
    if (doc.closed) {
      body.appendChild(el("p", "hint", tr("This goal is closed to new people.")));
      body.appendChild(notNow); return;
    }
    var join = el("button", "primary-btn", tr("Join goal"), { type: "button", id: "joinGo" });
    join.addEventListener("click", function () {
      join.disabled = true;
      S.join(id, myName()).then(function (res) {
        var ids = ensureSharedIds(); if (ids.indexOf(id) < 0) ids.push(id);
        C.save();
        docCache[id] = res.doc;
        syncSharedGoal(res.doc);
        setPendingJoin(null); closeJoin();
        if (window.renderGoals) window.renderGoals(true);
        C.toast(tr("You are in. Your steps are on your calendar."));
      }).catch(function () { C.toast(tr("Joining did not work. Check your connection and try again.")); join.disabled = false; });
    });
    body.appendChild(join); body.appendChild(notNow);
  }

  /* ---------- "Shared goals" section on the Goals screen ---------- */
  function renderSharedSection(root) {
    var me = myUid(); if (!me || !root) return;
    var sec = el("div", null, null, { id: "sgSection" });
    var ids = ensureSharedIds().slice();
    if (ids.length) sec.appendChild(el("h3", "gf-h", tr("Shared goals")));
    ids.forEach(function (id) {
      var doc = docCache[id];
      if (!doc) {
        sec.appendChild(el("p", "hint", tr("Loading…")));
        if (!fetching[id]) { fetching[id] = true; refreshShared(id, true).then(function () { fetching[id] = false; }); }
        return;
      }
      sec.appendChild(sharedCard(doc));
    });
    // paste-a-link row, always there
    var row = el("div", "sg-linkrow");
    var inp = el("input", null, null, { type: "text", id: "sgJoinInput", placeholder: tr("Have a share link? Paste it here"), "aria-label": tr("Have a share link? Paste it here") });
    var jb = el("button", "soft-btn", tr("Join goal"), { type: "button", id: "sgJoinBtn" });
    jb.addEventListener("click", function () {
      var id = parseJoin(inp.value);
      if (!id) { C.toast(tr("That does not look like a share link.")); return; }
      setPendingJoin(id); openJoin(id);
    });
    row.appendChild(inp); row.appendChild(jb);
    sec.appendChild(row);
    root.appendChild(sec);
  }

  function sharedCard(doc) {
    var me = myUid();
    var card = el("div", "goal-card", null, { "data-shared": doc.id });
    var head = el("div", "goal-head");
    head.appendChild(el("span", "goal-emoji", "👥"));
    var tx = el("div", "goal-title-wrap");
    tx.appendChild(el("span", "goal-title", doc.title));
    tx.appendChild(el("span", "goal-chip", doc.ownerUid === me ? tr("Shared by you") : tr("Shared by {name}", { name: doc.ownerName || tr("Someone") })));
    head.appendChild(tx);
    card.appendChild(head);
    var steps = doc.steps || [], done = steps.filter(function (s) { return s.status === "done"; }).length;
    var pct = steps.length ? Math.round(done * 100 / steps.length) : 0;
    var bar = el("div", "goal-bar", null, { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": doc.title });
    var fill = el("div", "goal-fill"); fill.style.width = pct + "%"; bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(el("div", "goal-nums", tr("{a} of {b} steps done", { a: done, b: steps.length }) + " · " + pct + "%"));
    memberList(doc).forEach(function (m) {
      var n = steps.filter(function (s) { return s.status === "done" && s.doneBy === m.uid; }).length;
      if (n) card.appendChild(el("p", "goal-msg", memberName(doc, m.uid) + ": " + tr("{n} done", { n: n })));
    });
    if (doc.closed) { card.appendChild(el("p", "goal-msg", tr("Sharing is stopped for this goal."))); return card; }
    var acts = el("div", "goal-actions");
    var seeBtn = el("button", "soft-btn", tr("See steps"), { type: "button", "aria-expanded": "false" });
    acts.appendChild(seeBtn);
    if (doc.ownerUid === me) {
      var mg = el("button", "soft-btn", tr("Manage sharing"), { type: "button" });
      mg.addEventListener("click", function () {
        var g = (C.state.goals || []).filter(function (x) { return x.sharedGoalId === doc.id; })[0];
        if (g) openShare(g);
      });
      acts.appendChild(mg);
    } else {
      var lv = el("button", "soft-btn danger", tr("Leave goal"), { type: "button" });
      lv.addEventListener("click", function () {
        lv.textContent = tr("Tap again to leave");
        lv.addEventListener("click", function () { leaveMine(doc); }, { once: true });
      });
      acts.appendChild(lv);
    }
    card.appendChild(acts);
    var box = el("div", "goal-steps"); box.hidden = true; card.appendChild(box);
    seeBtn.addEventListener("click", function () {
      var open = box.hidden; box.hidden = !open; seeBtn.setAttribute("aria-expanded", String(open));
      seeBtn.textContent = open ? tr("Hide steps") : tr("See steps");
      if (open) drawSharedSteps(doc, box);
    });
    return card;
  }

  function drawSharedSteps(doc, box) {
    var me = myUid();
    box.innerHTML = "";
    var steps = (doc.steps || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!steps.length) { box.appendChild(el("p", "hint", tr("No steps yet."))); return; }
    steps.forEach(function (s) {
      var row = el("div", "gs-row" + (s.status === "done" ? " is-done" : ""));
      var mine = s.assignee === me;
      if (mine) {
        var b = el("button", "gs-tick", null, { type: "button", "aria-pressed": String(s.status === "done"), "aria-label": tr("Done") + ": " + s.title });
        if (s.status === "done") b.innerHTML = C.icon("i-check");
        b.addEventListener("click", function () {
          var local = C.state.tasks.filter(function (t) { return t.sharedGoalId === doc.id && t.sharedStepId === s.sid; })[0];
          if (local) { local.status = local.status === "done" ? "todo" : "done"; local.done = local.status === "done"; C.save(); onLocalTick(local); }
        });
        row.appendChild(b);
      } else {
        row.appendChild(el("span", "gs-tick-off", s.status === "done" ? "✓" : ""));
      }
      var tx = el("div", "gs-text");
      tx.appendChild(el("span", "gs-title", s.title));
      var who = s.status === "done" ? tr("Done by {name}", { name: memberName(doc, s.doneBy) })
        : s.assignee ? memberName(doc, s.assignee) : tr("Up for grabs");
      tx.appendChild(el("span", "gs-date", niceDate(s.date) + " · " + who));
      row.appendChild(tx);
      if (s.status !== "done") {
        if (!s.assignee) {
          var grab = el("button", "soft-btn", tr("I'll do this one"), { type: "button" });
          grab.addEventListener("click", function () {
            grab.disabled = true;
            S.act(doc.id, function (d) { var st = (d.steps || []).filter(function (x) { return x.sid === s.sid; })[0]; if (st && !st.assignee) st.assignee = me; })
              .then(function (d) { docCache[doc.id] = d; syncSharedGoal(d); if (window.renderGoals) window.renderGoals(true); C.toast(tr("It's yours. It is on your calendar.")); })
              .catch(function () { C.toast(tr("That did not work. Try again.")); });
          });
          row.appendChild(grab);
        } else if (mine) {
          var back = el("button", "soft-btn", tr("Put back"), { type: "button" });
          back.addEventListener("click", function () {
            back.disabled = true;
            S.act(doc.id, function (d) { var st = (d.steps || []).filter(function (x) { return x.sid === s.sid; })[0]; if (st && st.assignee === me) st.assignee = null; })
              .then(function (d) { docCache[doc.id] = d; syncSharedGoal(d); if (window.renderGoals) window.renderGoals(true); C.toast(tr("Back up for grabs.")); })
              .catch(function () { C.toast(tr("That did not work. Try again.")); });
          });
          row.appendChild(back);
        }
      }
      box.appendChild(row);
    });
  }

  function leaveMine(doc) {
    S.leave(doc.id).then(function () {
      // my open copies leave my calendar; my done copies stay as plain tasks
      C.state.tasks.forEach(function (t) { if (t.sharedGoalId === doc.id && t.status === "done") { delete t.sharedGoalId; delete t.sharedStepId; t.source = "typed"; } });
      C.state.tasks = C.state.tasks.filter(function (t) { return t.sharedGoalId !== doc.id; });
      C.state.sharedGoalIds = ensureSharedIds().filter(function (i) { return i !== doc.id; });
      delete docCache[doc.id];
      C.save();
      if (window.renderGoals) window.renderGoals(true);
      C.toast(tr("You left the goal. Your finished steps stay on your calendar."));
    }).catch(function () { C.toast(tr("That did not work. Try again.")); });
  }

  /* Account deletion (the sweep in app.js calls this): owned
     shared goals are destroyed, memberships are left, best
     effort — a leftover row holds a name and uid, nothing more. */
  function leaveAllShared() {
    var me = myUid(), ids = ensureSharedIds().slice();
    return Promise.all(ids.map(function (id) {
      return S.get(id).then(function (doc) {
        if (!doc) return;
        if (doc.ownerUid === me) return S.destroy(id);
        return S.leave(id);
      }).catch(function () {});
    }));
  }

  var closeBtn = $("shareClose");
  if (closeBtn) closeBtn.addEventListener("click", closeShare);

  /* Boot: a share link lands here as ?join=<id>. Keep it while
     the door does its work, then offer the join the moment a
     session stands. */
  try {
    var m = location.search.match(/[?&]join=([A-Za-z0-9]{16,})/);
    if (m) { setPendingJoin(m[1]); history.replaceState(null, "", location.pathname); }
  } catch (e) {}
  setInterval(function () {
    var id = pendingJoin();
    if (id && myUid() && !joinOpen) {
      // Wait for the door, the welcome and Skip's tour to be
      // done — the join offer stands right after them, never
      // on top of them.
      var busy = ["authSheet", "guideSheet", "welcome"].some(function (x) { var n = $(x); return n && !n.hidden; });
      if (!busy) openJoin(id);
    }
  }, 2000);
  /* The team's truth, refreshed gently: on boot, and every 45 s
     while the app is in front. Ticks of my own write at once. */
  function beat() {
    var panel = $("panel-goals");
    var onGoals = !!(panel && panel.classList.contains("is-active"));
    ensureSharedIds().forEach(function (id) { refreshShared(id, onGoals); });
  }
  setTimeout(beat, 3500);
  setInterval(function () { if (typeof document !== "undefined" && document.visibilityState === "visible") beat(); }, 45000);

  window.PaceShareUI = { openShare: openShare, renderSharedSection: renderSharedSection, divideSteps: divideSteps, applyAssignmentsToMine: applyAssignmentsToMine, onLocalTick: onLocalTick, syncSharedGoal: syncSharedGoal, leaveAllShared: leaveAllShared, _docCache: docCache };
})();
