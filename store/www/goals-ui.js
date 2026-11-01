/* Pace Calendar: Goals screen + the Habits week view. Loaded after app.js and
   uses its globals (state, save, uid, tr, toast, refreshAll, restoreAt, $, L). */
(function () {
"use strict";
var G = window.PaceGoals, C = window.PaceCtx, L = window.CalmLogic, tr = window.t;
if (!G || !C) return;
function $(id) { return document.getElementById(id); }
function save() { C.save(); }
function uid() { return C.uid(); }
function toast(m, u) { C.toast(m, u); }
function refreshAll() { C.refreshAll(); }
function restoreAt(a, i, n) { C.restoreAt(a, i, n); }
function icon(n) { return C.icon(n); }
function habitIconId(k) { return C.habitIconId(k); }
var _state = function () { return C.state; };

function el(tag, cls, text, attrs) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
  return n;
}
function niceDate(k) {
  var p = k.split("-"), d = new Date(+p[0], p[1] - 1, +p[2]);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function ensureGoals() { if (!Array.isArray(C.state.goals)) C.state.goals = []; return C.state.goals; }

/* Free-space placement (build 33): the first real gap in a day's timed
   tasks between 07:00 and 21:30, on the half hour, that fits the step.
   Returns "HH:MM" or null when the day has no room — the step then
   sits in the day's list, never stacked on top of something else. */
function freeSlot(key, mins, placed) {
  var busy = [];
  function addBusy(t) {
    if (!t || t.date !== key || !t.time || t.status === "done") return;
    var p = String(t.time).split(":");
    var s = (+p[0]) * 60 + (+p[1] || 0);
    busy.push([s, s + Math.max(5, t.durationMin || 25)]);
  }
  C.state.tasks.forEach(addBusy);
  (placed || []).forEach(addBusy);
  for (var start = 7 * 60; start + mins <= 21 * 60 + 30; start += 30) {
    var clash = busy.some(function (b) { return start < b[1] && start + mins > b[0]; });
    if (!clash) return L.pad(Math.floor(start / 60)) + ":" + L.pad(start % 60);
  }
  return null;
}
/* A wanted time (build 34): the business plan asks for 09:00, 13:00 and so on.
   It gets that time only if nothing timed is already there. */
function timeFree(key, hhmm, mins, placed) {
  var p = String(hhmm).split(":"), s0 = (+p[0]) * 60 + (+p[1] || 0), clash = false;
  function chk(t) {
    if (!t || t.date !== key || !t.time || t.status === "done") return;
    var q = String(t.time).split(":"), a = (+q[0]) * 60 + (+q[1] || 0);
    if (s0 < a + Math.max(5, t.durationMin || 25) && s0 + mins > a) clash = true;
  }
  C.state.tasks.forEach(chk); (placed || []).forEach(chk);
  return !clash;
}
function slotFor(st, placed) {
  if (st.time && timeFree(st.date, st.time, st.durationMin, placed)) return st.time;
  return freeSlot(st.date, st.durationMin, placed);
}
/* Quiet replan (build 33): a missed day slides on its own. Once a day,
   when the Goals screen renders, any goal with an overdue open step is
   re-planned from today with the standing replan — no button to find,
   no pile to face. The goal card's own words still say steps slipped. */
function autoSlide() {
  var today = L.todayKey(), moved = false;
  ensureGoals().forEach(function (g) {
    if (g.lastSlide === today) return;
    g.lastSlide = today;
    var overdue = C.state.tasks.some(function (t) { return t.goalId === g.id && t.status !== "done" && t.date < today; });
    if (overdue) { var r = G.replan(g, C.state.tasks, today); if (r.moved) moved = true; }
  });
  if (moved) save();
}

/* ================= HABITS: the week, a tap, a forgiving streak ================= */
function renderHabits() {
  var wrap = $("habitList"); if (!wrap) return;
  wrap.innerHTML = "";
  ensureHabitForm();
  var today = L.todayKey(), week = G.weekDays(today);
  if (!C.state.habits.length) {
    var empty = el("div", "empty-note");
    empty.appendChild(el("span", null, tr("No habits yet. Start with one small habit, then add its tiny version below.")));
    wrap.appendChild(empty);
  }
  C.state.habits.forEach(function (h, idx) {
    var s = G.habitStats(h.days, today);
    var card = el("div", "habit-card");
    var head = el("div", "habit-head");
    var ico = el("span", "habit-ico tint-" + (idx % 6));
    ico.innerHTML = icon(habitIconId(h.icon));
    var main = el("div", "habit-main");
    main.appendChild(el("span", "habit-name", h.name));
    if (h.plan) main.appendChild(el("span", "habit-sub", h.plan));
    if (h.time) main.appendChild(el("span", "habit-sub", tr("Every day at {time}, on your calendar", { time: h.time })));
    if (h.tiny) main.appendChild(el("span", "habit-sub", tr("Smallest version:") + " " + h.tiny));
    var del = el("button", "habit-del", null, { "aria-label": tr("Delete habit"), type: "button" });
    del.innerHTML = icon("i-trash");
    head.appendChild(ico); head.appendChild(main); head.appendChild(del);
    card.appendChild(head);

    var row = el("div", "habit-weekrow", null, { role: "group", "aria-label": tr("This week") });
    week.forEach(function (d) {
      var done = !!h.days[d.key];
      var b = el("button", "hw-day" + (done ? " is-done" : "") + (d.today ? " is-today" : "") + (d.future ? " is-future" : ""), null, {
        type: "button", "data-key": d.key, "aria-pressed": String(done),
        "aria-label": d.name + " " + niceDate(d.key) + ", " + (done ? tr("done") : tr("not done"))
      });
      if (d.future) b.disabled = true;
      b.appendChild(el("span", "hw-label", d.label));
      var dot = el("span", "hw-dot");
      if (done) dot.innerHTML = icon("i-check");
      b.appendChild(dot);
      b.addEventListener("click", function () {
        if (h.days[d.key]) delete h.days[d.key]; else h.days[d.key] = true;
        if (h.taskId) { var lt = C.state.tasks.filter(function (x) { return x.id === h.taskId; })[0]; if (lt) { lt.doneDates = lt.doneDates || []; var di = lt.doneDates.indexOf(d.key); if (h.days[d.key] && di === -1) lt.doneDates.push(d.key); if (!h.days[d.key] && di !== -1) lt.doneDates.splice(di, 1); } }
        save(); renderHabits();
        if (h.days[d.key]) { var ns = G.habitStats(h.days, L.todayKey()); toast(tr(G.habitMessage(ns))); }
      });
      row.appendChild(b);
    });
    card.appendChild(row);

    var stats = el("div", "habit-stats");
    var st1 = el("span", "hs"); st1.appendChild(el("strong", null, String(s.current))); st1.appendChild(document.createTextNode(" " + (s.current === 1 ? tr("day streak") : tr("day streak"))));
    var st2 = el("span", "hs", tr("Best") + " " + s.best);
    var st3 = el("span", "hs", tr("{n} of 7 this week", { n: s.weekDone }));
    stats.appendChild(st1); stats.appendChild(st2); stats.appendChild(st3);
    card.appendChild(stats);
    card.appendChild(el("p", "habit-msg", tr(G.habitMessage(s))));

    del.addEventListener("click", function () {
      var at = C.state.habits.indexOf(h);
      var lnk = h.taskId ? C.state.tasks.filter(function (x) { return x.id === h.taskId; })[0] : null;
      C.state.habits = C.state.habits.filter(function (x) { return x.id !== h.id; });
      if (lnk) C.state.tasks = C.state.tasks.filter(function (x) { return x !== lnk; });
      save(); renderHabits(); C.refreshAll();
      toast(tr("Habit removed."), function () { restoreAt(C.state.habits, h, at); if (lnk) C.state.tasks.push(lnk); save(); renderHabits(); C.refreshAll(); toast(tr("Back again.")); });
    });
    wrap.appendChild(card);
  });
  renderWhy();
}
function ensureHabitForm() {
  if ($("habitPlan")) return;
  var name = $("habitName"); if (!name) return;
  var plan = el("input", null, null, { id: "habitPlan", type: "text", autocomplete: "off", maxlength: "90", placeholder: tr("When and where? e.g. After breakfast, at the kitchen table"), "aria-label": tr("When and where") });
  var tiny = el("input", null, null, { id: "habitTiny", type: "text", autocomplete: "off", maxlength: "70", placeholder: tr("Smallest version for hard days? e.g. Put my shoes on"), "aria-label": tr("Smallest version") });
  name.parentNode.insertBefore(plan, name.nextSibling);
  name.parentNode.insertBefore(tiny, plan.nextSibling);
  var tl = el("label", "field habit-time-field", tr("Remind me at (optional): puts it on your calendar every day"));
  var ti = el("input", null, null, { id: "habitTime", type: "time", "aria-label": tr("Habit time") });
  tl.appendChild(ti); name.parentNode.insertBefore(tl, tiny.nextSibling);
  [plan, tiny].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") C.submitHabit(); }); });
}
function renderWhy() {
  var panel = $("panel-habits"); if (!panel || $("habitWhy")) return;
  var d = el("details", "why-box", null, { id: "habitWhy" });
  d.appendChild(el("summary", null, tr("Why this works")));
  [
    "Missing one day barely changes how a habit forms. Missing two in a row is the real risk, so the streak forgives one gap. (Lally et al., UCL, 2010)",
    "On average a habit feels automatic after about 66 days, but it ranges from 18 to 254. Be patient. (Lally et al., 2010)",
    "A plan for when and where roughly doubles follow-through. That is the 'When and where' box. (Gollwitzer and Sheeran, 2006)",
    "A tiny version for hard days keeps the habit alive when energy is low.",
    "Aim for 5 of 7 days, not perfection. Tracking itself helps people stick with it."
  ].forEach(function (t) { d.appendChild(el("p", null, tr(t))); });
  panel.appendChild(d);
}

/* ================= GOALS ================= */
var draft = null; // { title, notes, category, end, pace, mins, steps }
var showForm = false;

function renderGoals(force) {
  var root = $("goalsRoot"); if (!root) return;
  // do not wipe a form the person is typing in when something else refreshes the app
  if (!force && showForm && !draft && $("goalTitle")) return;
  root.innerHTML = "";
  var goals = ensureGoals(), today = L.todayKey();
  autoSlide();
  var intro = el("p", "panel-lede", tr("Give Pace one big goal. It becomes one small step a day on your calendar, so you can finish without feeling swamped."));
  root.appendChild(intro);

  // today's goal steps
  var todays = C.state.tasks.filter(function (t) { return t.goalId && t.date === today; });
  if (todays.length) {
    var d = todays.filter(function (t) { return t.status === "done"; }).length;
    root.appendChild(el("div", "goal-today", tr("Goal steps today: {a} of {b} done", { a: d, b: todays.length })));
  }

  if (showForm) root.appendChild(buildForm());
  else {
    var add = el("button", "primary-btn", tr("New goal"), { type: "button", id: "goalNewBtn" });
    add.addEventListener("click", function () { showForm = true; draft = null; renderGoals(true); var t = $("goalTitle"); if (t) t.focus(); });
    root.appendChild(add);
  }

  if (!goals.length && !showForm) root.appendChild(el("div", "empty-note", tr("No goals yet. A semester goal, a certificate, a tidy home: start with one.")));
  goals.forEach(function (g) { root.appendChild(goalCard(g, today)); });
  // Shared goals (build 39): goals other people shared with me.
  if (window.PaceShareUI) window.PaceShareUI.renderSharedSection(root);
  var why = el("details", "why-box");
  why.appendChild(el("summary", null, tr("Why small steps")));
  [
    "A big goal far away is hard to start. One small step today is easy to start, and each step you finish shows real progress. Seeing how close you are makes you want to keep going.",
    "Pace plans backwards from your date, and keeps the last days free as a buffer, so one slow week never ruins the plan.",
    "You decide the plan once, now, when you are calm. Later you just do today's step."
  ].forEach(function (t) { why.appendChild(el("p", null, tr(t))); });
  root.appendChild(why);
}

function field(labelText, node) {
  var w = el("label", "gf-field");
  w.appendChild(el("span", "gf-label", labelText));
  w.appendChild(node);
  return w;
}
function buildForm() {
  var f = el("form", "goal-form", null, { novalidate: "novalidate" });
  f.addEventListener("submit", function (e) { e.preventDefault(); });
  if (draft && draft.steps) return buildPreview(f);
  if (draft && draft.ask) return buildAsk(f);
  var today = L.todayKey();
  var title = el("input", null, null, { id: "goalTitle", type: "text", maxlength: "100", autocomplete: "off", placeholder: tr("e.g. Pass my biology exam") });
  var notes = el("textarea", null, null, { id: "goalNotes", rows: "5", maxlength: "6000", placeholder: tr("Optional: paste your outline, syllabus or notes. One item per line becomes a stage of your plan.") });
  var file = el("input", null, null, { id: "goalFile", type: "file", accept: ".txt,.md,text/plain", hidden: "hidden" });
  var fileBtn = el("label", "soft-btn", tr("Add a text file"));
  fileBtn.appendChild(file);
  var fileMsg = el("p", "hint", "", { id: "goalFileMsg", role: "status" });
  file.addEventListener("change", function () {
    var fl = file.files && file.files[0]; if (!fl) return;
    if (!/\.(txt|md)$/i.test(fl.name) && fl.type !== "text/plain") { fileMsg.textContent = tr("Pace reads .txt and .md files. For a PDF or Word file, copy the text and paste it above."); return; }
    if (fl.size > 200000) { fileMsg.textContent = tr("That file is too big. Paste the part that matters."); return; }
    var r = new FileReader();
    r.onload = function () { notes.value = String(r.result || "").slice(0, 6000); fileMsg.textContent = tr("Added. Check it, then make the plan."); };
    r.onerror = function () { fileMsg.textContent = tr("Could not read that file."); };
    r.readAsText(fl);
  });
  var cats = el("div", "gf-cats", null, { role: "radiogroup", "aria-label": tr("What kind of goal") });
  var picked = (draft && draft.category) || "personal";
  G.GOAL_CATEGORIES.forEach(function (c) {
    var b = el("button", "gf-cat" + (c.id === picked ? " is-on" : ""), c.emoji + " " + tr(c.label), { type: "button", role: "radio", "aria-checked": String(c.id === picked), "data-cat": c.id });
    b.addEventListener("click", function () {
      picked = c.id;
      cats.querySelectorAll(".gf-cat").forEach(function (x) { var on = x.getAttribute("data-cat") === picked; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", String(on)); });
    });
    cats.appendChild(b);
  });
  var endDefault = L.addDays(today, 84);
  var end = el("input", null, null, { id: "goalEnd", type: "date", value: (draft && draft.end) || endDefault, min: L.addDays(today, 1) });
  var pace = el("select", null, null, { id: "goalPace" });
  [["daily", tr("Every day")], ["weekdays", tr("Weekdays only")], ["three", tr("Three days a week (Mon, Wed, Fri)")]].forEach(function (o) { pace.appendChild(el("option", null, o[1], { value: o[0] })); });
  var mins = el("select", null, null, { id: "goalMins" });
  [10, 20, 30, 45].forEach(function (m) { var o = el("option", null, tr("About {n} minutes a day", { n: m }), { value: String(m) }); if (m === 20) o.selected = true; mins.appendChild(o); });
  var price = el("input", null, null, { id: "goalPrice", type: "number", min: "1", inputmode: "decimal", placeholder: tr("Optional, for money goals: price of one sale") });
  var err = el("p", "gf-err", "", { id: "goalErr", role: "alert" });
  var go = el("button", "primary-btn", tr("Make my plan"), { type: "button", id: "goalPlanBtn" });
  var cancel = el("button", "soft-btn", tr("Cancel"), { type: "button" });
  cancel.addEventListener("click", function () { showForm = false; draft = null; renderGoals(true); });
  go.addEventListener("click", function () {
    var t = title.value.trim(), n = notes.value;
    if (!t && n.trim()) t = n.trim().split(/\r\n|\n|\r/)[0].replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, "").slice(0, 60);
    if (!t) { err.textContent = tr("Give your goal a name first."); title.focus(); return; }
    if (!end.value || end.value <= today) { err.textContent = tr("Pick a finish date after today."); end.focus(); return; }
    var base = { price: +price.value || 0, title: t, notes: n, category: picked, end: end.value, pace: pace.value, mins: +mins.value };
    var qs = G.questionsFor(t, t + "\n" + n, picked, n);
    if (qs.length) { base.ask = qs; base.answers = {}; draft = base; renderGoals(true); return; }
    if (!finishPlan(base)) { err.textContent = tr("That date is too close for a plan. Pick a later date."); return; }
    renderGoals(true);
  });
  f.appendChild(field(tr("What is your goal?"), title));
  f.appendChild(field(tr("Details (optional)"), notes));
  f.appendChild(fileBtn); f.appendChild(fileMsg);
  var kind = el("div", "gf-field"); kind.appendChild(el("span", "gf-label", tr("What kind of goal is it?"))); kind.appendChild(cats); f.appendChild(kind);
  f.appendChild(field(tr("Finish by"), end));
  f.appendChild(field(tr("How often?"), pace));
  f.appendChild(field(tr("How long each day?"), mins));
  f.appendChild(field(tr("Price of one sale (business goals)"), price));
  f.appendChild(err);
  var row = el("div", "gf-actions"); row.appendChild(go); row.appendChild(cancel); f.appendChild(row);
  setTimeout(function () { if (draft) { title.value = draft.title || ""; notes.value = draft.notes || ""; pace.value = draft.pace || "daily"; mins.value = String(draft.mins || 20); } }, 0);
  return f;
}
function finishPlan(d) {
  var today = L.todayKey(), a = d.answers || {}, price = +a.price || d.price || 0, notes = d.notes || "";
  var lines = notes.split(/\r\n|\n|\r/).filter(function (l) { return l.trim().length >= 3; });
  var ms = lines.length >= 3 ? G.parseMilestones(notes, d.category) : undefined;
  if (!ms && a.parts) {
    var parts = String(a.parts).split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 2; });
    if (parts.length >= 2) {
      ms = [];
      if (a.done) ms.push("Write down what done looks like: " + a.done);
      ms = ms.concat(parts.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }));
      ms.push("Check it and fix gaps"); ms.push("Finish and share");
    }
  }
  var steps = G.buildPlan({ title: d.title, category: d.category, start: today, end: d.end, pace: d.pace, mins: d.mins, milestones: ms, text: d.title + "\n" + notes, price: price, answers: a });
  if (!steps.length) return false;
  steps.forEach(function (st) { st.full = st.time ? false : !freeSlot(st.date, st.durationMin); });
  if (a.done) d.notes = "Done looks like: " + a.done + (notes ? "\n" + notes : "");
  d.price = price; d.steps = steps; d.fullCount = steps.filter(function (s) { return s.full; }).length; d.ask = null;
  draft = d; return true;
}
function buildAsk(f) {
  f.appendChild(el("h3", "gf-h", draft.title));
  f.appendChild(el("p", "gf-sum", tr("A few quick questions, so the steps fit you. Skip any you like.")));
  draft.ask.forEach(function (q) {
    var box = el("div", "gf-field", null, { "data-q": q.id });
    box.appendChild(el("span", "gf-label", tr(q.label)));
    if (q.options) {
      var row = el("div", "gf-cats", null, { role: "radiogroup", "aria-label": tr(q.label) });
      var cur = draft.answers[q.id] || "";
      q.options.forEach(function (o) {
        var b = el("button", "gf-cat" + (o.v === cur ? " is-on" : ""), tr(o.l), { type: "button", role: "radio", "aria-checked": String(o.v === cur), "data-v": o.v });
        b.addEventListener("click", function () {
          draft.answers[q.id] = o.v;
          row.querySelectorAll(".gf-cat").forEach(function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", String(on)); });
        });
        row.appendChild(b);
      });
      box.appendChild(row);
    } else {
      var inp = el("input", null, null, { type: q.type === "number" ? "number" : "text", id: "goalQ_" + q.id, maxlength: "120", autocomplete: "off", placeholder: tr(q.placeholder || "") });
      if (q.type === "number") { inp.setAttribute("min", "1"); inp.setAttribute("inputmode", "decimal"); }
      inp.value = draft.answers[q.id] || "";
      inp.addEventListener("input", function () { draft.answers[q.id] = inp.value.trim(); });
      box.appendChild(inp);
    }
    f.appendChild(box);
  });
  var err = el("p", "gf-err", "", { role: "alert" });
  f.appendChild(err);
  var go = el("button", "primary-btn", tr("Make my plan"), { type: "button", id: "goalAskGo" });
  var skip = el("button", "soft-btn", tr("Skip the questions"), { type: "button", id: "goalAskSkip" });
  var back = el("button", "soft-btn", tr("Change something"), { type: "button" });
  function run(skipAll) { if (skipAll) draft.answers = {}; if (!finishPlan(draft)) { err.textContent = tr("That date is too close for a plan. Pick a later date."); return; } renderGoals(true); }
  go.addEventListener("click", function () { run(false); });
  skip.addEventListener("click", function () { run(true); });
  back.addEventListener("click", function () { draft = null; renderGoals(true); });
  var row2 = el("div", "gf-actions"); row2.appendChild(go); row2.appendChild(skip); row2.appendChild(back); f.appendChild(row2);
  return f;
}
function buildPreview(f) {
  var s = draft.steps, last = s[s.length - 1];
  f.appendChild(el("h3", "gf-h", draft.title));
  var free = G.diffDays(last.date, draft.end);
  f.appendChild(el("p", "gf-sum", tr("{n} small steps, about {m} minutes each. First step today, last step {d}.", { n: s.length, m: s.analysis ? s[0].durationMin : draft.mins, d: niceDate(last.date) }) + (free > 1 ? " " + tr("The last {n} days are kept free as a buffer.", { n: free }) : "")));
  if (s.analysis) {
    f.appendChild(el("p", "gf-sum", "Pace read your goal: " + s.analysis.summary + "."));
    var wk = el("div", "gf-weeks");
    s.analysis.weeks.forEach(function (w) { var r = el("p", "gf-week"); r.appendChild(el("span", "gs-date", niceDate(w.start))); r.appendChild(el("span", "gs-title", w.text)); wk.appendChild(r); });
    f.appendChild(wk);
    if (s.analysis.typicalDay) {
      f.appendChild(el("p", "gf-sum", tr("A normal day looks like this:")));
      var td = el("ol", "gf-steps");
      s.analysis.typicalDay.forEach(function (x) { var li = el("li"); li.appendChild(el("span", "gs-date", x.time)); li.appendChild(el("span", "gs-title", x.title)); td.appendChild(li); });
      f.appendChild(td);
      f.appendChild(el("p", "hint", tr("Each block has a reminder before it starts. You can change any time in your calendar.")));
      if (s.analysis.guess) f.appendChild(el("p", "hint", s.analysis.guess));
    }
    if (s.analysis.tight) f.appendChild(el("p", "hint", tr("That is a lot for the days left. The steps are bigger than usual \u2014 a later finish date would make them small again.")));
  }
  if (draft.fullCount) f.appendChild(el("p", "hint", tr("{n} of these days already look full, so those steps will sit in the day's list instead of at a set time.", { n: draft.fullCount })));
  var list = el("ol", "gf-steps");
  s.slice(0, 6).forEach(function (st) { var li = el("li"); li.appendChild(el("span", "gs-date", niceDate(st.date))); li.appendChild(el("span", "gs-title", st.title)); list.appendChild(li); });
  f.appendChild(list);
  if (s.length > 6) f.appendChild(el("p", "hint", tr("…and {n} more steps.", { n: s.length - 6 })));
  f.appendChild(el("p", "hint", tr("Each step also has a 5-minute version for hard days. You can move or change any step later in your calendar.")));
  var ok = el("button", "primary-btn", tr("Add to my calendar"), { type: "button", id: "goalAddBtn" });
  var back = el("button", "soft-btn", tr("Change something"), { type: "button" });
  ok.addEventListener("click", function () { commitDraft(); });
  back.addEventListener("click", function () { draft.steps = null; renderGoals(true); });
  var row = el("div", "gf-actions"); row.appendChild(ok); row.appendChild(back); f.appendChild(row);
  return f;
}
function commitDraft() {
  var d = draft, cat = G.goalCategory(d.category), today = L.todayKey();
  var goal = { id: uid(), title: d.title, category: d.category, start: today, end: d.end, pace: d.pace, mins: d.mins, notes: String(d.notes || "").slice(0, 6000), created: Date.now() };
  ensureGoals().push(goal);
  var placed = [];
  d.steps.forEach(function (st) {
    var slot = slotFor(st, placed);
    var task = { id: uid(), title: st.title, date: st.date, time: slot, durationMin: st.durationMin, priority: 0, repeat: null, category: "other", color: cat.color, icon: cat.emoji,
      essential: false, status: "todo", steps: [], minVersion: st.minVersion, fullVersion: "", source: "goal", goalId: goal.id, remind: [10], originalText: goal.title, skipDates: [], doneDates: [] };
    C.state.tasks.push(task);
    if (slot) placed.push(task);
  });
  draft = null; showForm = false;
  save(); refreshAll();
  toast(tr("Done. {n} small steps are on your calendar.", { n: d.steps.length }));
}

function goalCard(g, today) {
  var cat = G.goalCategory(g.category), p = G.goalProgress(g, C.state.tasks, today);
  var card = el("div", "goal-card", null, { "data-goal": g.id });
  card.style.setProperty("--gc", cat.color);
  var head = el("div", "goal-head");
  head.appendChild(el("span", "goal-emoji", cat.emoji));
  var tx = el("div", "goal-title-wrap");
  tx.appendChild(el("span", "goal-title", g.title));
  tx.appendChild(el("span", "goal-chip", tr(cat.label) + (p.daysLeft != null ? " · " + (p.daysLeft === 1 ? tr("1 day left") : tr("{n} days left", { n: p.daysLeft })) : "")));
  head.appendChild(tx);
  card.appendChild(head);
  var bar = el("div", "goal-bar", null, { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p.pct), "aria-label": g.title });
  var fill = el("div", "goal-fill"); fill.style.width = p.pct + "%"; bar.appendChild(fill);
  card.appendChild(bar);
  card.appendChild(el("div", "goal-nums", tr("{a} of {b} steps done", { a: p.done, b: p.total }) + " · " + p.pct + "%" + (p.activeDays ? " · " + (p.activeDays === 1 ? tr("moved forward on 1 day") : tr("moved forward on {n} days", { n: p.activeDays })) : "")));
  var msg;
  if (p.state === "complete") msg = tr("Goal complete. You did that, one small step at a time.");
  else if (p.state === "behind") msg = tr("A few steps slipped. That is okay. Spread them out again?");
  else if (p.state === "slightly") msg = tr("One step slipped. No stress, it is still easy to catch up.");
  else msg = p.done ? tr("On track. Keep it small.") : tr("Ready when you are. Your first step is waiting.");
  card.appendChild(el("p", "goal-msg", msg));
  if (p.next && p.state !== "complete") card.appendChild(el("p", "goal-next", tr("Next:") + " " + p.next.title + " (" + (p.next.date === today ? tr("today") : niceDate(p.next.date)) + ")"));
  var acts = el("div", "goal-actions");
  if (p.behind) {
    var rp = el("button", "soft-btn", tr("Re-plan from today"), { type: "button" });
    rp.addEventListener("click", function () {
      var r = G.replan(g, C.state.tasks, L.todayKey());
      save(); refreshAll();
      toast(r.failed ? tr("Moved {n} steps. There are more steps than days left, so pick a later finish date if it feels tight.", { n: r.moved }) : tr("Moved {n} steps onto the days ahead.", { n: r.moved }));
    });
    acts.appendChild(rp);
  }
  var seeBtn = el("button", "soft-btn", tr("See steps"), { type: "button", "aria-expanded": "false" });
  var del = el("button", "soft-btn danger", tr("Delete goal"), { type: "button" });
  // Shared goals (build 39): the share entry lives on the goal card.
  if (window.PaceShareUI) {
    var shBtn = el("button", "soft-btn", tr(g.sharedGoalId ? "Shared goal" : "Share this goal"), { type: "button" });
    shBtn.addEventListener("click", function () { window.PaceShareUI.openShare(g); });
    acts.appendChild(shBtn);
  }
  acts.appendChild(seeBtn); acts.appendChild(del);
  card.appendChild(acts);
  var stepsBox = el("div", "goal-steps"); stepsBox.hidden = true; card.appendChild(stepsBox);
  seeBtn.addEventListener("click", function () {
    var open = stepsBox.hidden; stepsBox.hidden = !open; seeBtn.setAttribute("aria-expanded", String(open));
    seeBtn.textContent = open ? tr("Hide steps") : tr("See steps");
    if (open) drawSteps(g, stepsBox);
  });
  del.addEventListener("click", function () {
    var mine = C.state.tasks.filter(function (t) { return t.goalId === g.id; });
    var open = mine.filter(function (t) { return t.status !== "done"; });
    var gi = C.state.goals.indexOf(g);
    var openIdx = open.map(function (t) { return [t, C.state.tasks.indexOf(t)]; });
    var doneTasks = mine.filter(function (t) { return t.status === "done"; });
    C.state.goals = C.state.goals.filter(function (x) { return x.id !== g.id; });
    C.state.tasks = C.state.tasks.filter(function (t) { return !(t.goalId === g.id && t.status !== "done"); });
    doneTasks.forEach(function (t) { t.goalId = null; });
    save(); refreshAll();
    toast(tr("Goal removed."), function () {
      restoreAt(C.state.goals, g, gi);
      openIdx.forEach(function (p2) { restoreAt(C.state.tasks, p2[0], p2[1]); });
      doneTasks.forEach(function (t) { t.goalId = g.id; });
      save(); refreshAll(); toast(tr("Back again."));
    });
  });
  return card;
}
function drawSteps(g, box) {
  box.innerHTML = "";
  var mine = C.state.tasks.filter(function (t) { return t.goalId === g.id; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  mine.forEach(function (t) {
    var row = el("div", "gs-row" + (t.status === "done" ? " is-done" : ""));
    var b = el("button", "gs-tick", null, { type: "button", "aria-pressed": String(t.status === "done"), "aria-label": tr("Done") + ": " + t.title });
    if (t.status === "done") b.innerHTML = icon("i-check");
    b.addEventListener("click", function () { t.status = t.status === "done" ? "todo" : "done"; save(); refreshAll(); });
    row.appendChild(b);
    var tx = el("div", "gs-text"); tx.appendChild(el("span", "gs-title", t.title)); tx.appendChild(el("span", "gs-date", niceDate(t.date)));
    row.appendChild(tx); box.appendChild(row);
  });
}

window.renderGoals = renderGoals;
window.PaceGoalsUI = { renderGoals: renderGoals, renderHabits: renderHabits };

// first paint
renderHabits();
renderGoals();
})();
