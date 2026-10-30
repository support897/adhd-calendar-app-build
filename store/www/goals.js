/* Pace Calendar: goals planner + habit streak maths. Pure functions (no DOM),
   so node can test them. Research notes live in pace-notes.md:
   - decide the plan ONCE, in a calm moment (planning backwards from the date)
   - one small, concrete step per day, with a 5-minute "smallest version"
   - progress bar = steps done (goal-gradient: closer feels better)
   - forgiving streaks: one missed day never resets (Lally 2010), two in a row does */
(function (root) {
"use strict";
var L = root.CalmLogic || (typeof require !== "undefined" ? require("./logic.js") : null);

function addDays(k, n) { return L.addDays(k, n); }
function diffDays(a, b) { // b - a in whole days
  var pa = a.split("-"), pb = b.split("-");
  return Math.round((Date.UTC(+pb[0], pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], pa[1] - 1, +pa[2])) / 86400000);
}
function weekdayOf(k) { var p = k.split("-"); return new Date(Date.UTC(+p[0], p[1] - 1, +p[2])).getUTCDay(); } // 0=Sun

/* ---------- goal categories ---------- */
var GOAL_CATEGORIES = [
  { id: "personal", label: "Personal", color: "#8E7CC3", emoji: "🌱" },
  { id: "school",   label: "School",   color: "#5B6BD5", emoji: "🎓" },
  { id: "work",     label: "Work",     color: "#3F536E", emoji: "💼" },
  { id: "health",   label: "Health",   color: "#E85D75", emoji: "❤️" },
  { id: "money",    label: "Money",    color: "#C9920E", emoji: "💰" },
  { id: "home",     label: "Home",     color: "#35704E", emoji: "🏠" },
  { id: "other",    label: "Other",    color: "#7A8699", emoji: "🎯" }
];
function goalCategory(id) { return GOAL_CATEGORIES.filter(function (c) { return c.id === id; })[0] || GOAL_CATEGORIES[GOAL_CATEGORIES.length - 1]; }

var TEMPLATES = {
  school: ["Get clear on what is due and when", "Gather your notes, readings and materials", "Learn the first part", "Learn the middle part", "Learn the last part", "Practise and test yourself", "Review the hard parts", "Final check and hand in"],
  work: ["Write down what done looks like", "Gather what you need", "Do the first part", "Do the middle part", "Do the last part", "Check it and fix gaps", "Finish and share"],
  health: ["Decide what done looks like and why it matters", "Set up what you need", "Start small: the first routine", "Build up gently", "Keep going: the middle stretch", "Check how it is going and adjust", "Reach it and look back"],
  money: ["Write down the exact number and date", "Gather your numbers", "Make the first move", "Keep going: the middle stretch", "Check the numbers and adjust", "Finish the last part", "Look back and celebrate"],
  home: ["Walk round and list what needs doing", "Gather what you need", "Do the first area", "Do the next area", "Do the last area", "Final tidy and check"],
  personal: ["Decide what done looks like", "Set up what you need", "Do the first part", "Keep going: the middle part", "Check how it is going and adjust", "Finish the last part", "Look back and celebrate"],
  other: ["Decide what done looks like", "Set up what you need", "Do the first part", "Keep going: the middle part", "Check how it is going and adjust", "Finish the last part", "Look back and celebrate"]
};

/* Small, different actions so a long stage never feels like the same chore every day. */
var ROTATE = ["Learn one small chunk: ", "Write 5 key points: ", "Say it back without notes: ", "Try 5 practice questions: ", "Fix the shaky bits: ", "Do one more small piece: "];

/* Milestones: the user's own lines if they pasted a list/outline, else a calm template. */
function parseMilestones(text, category) {
  var lines = String(text || "").split(/\r\n|\n|\r/).map(function (l) {
    return l.replace(/^\s*(?:[-*•\u2022]|\d{1,2}[.)]|week\s*\d+\s*[:\-]?)\s*/i, "").trim();
  }).filter(function (l) { return l.length >= 3; });
  lines = lines.map(function (l) { return l.length > 90 ? l.slice(0, 87).replace(/\s+\S*$/, "") + "…" : l; });
  if (lines.length >= 3) return lines.slice(0, 16);
  return (TEMPLATES[category] || TEMPLATES.other).slice();
}

/* ---------- the analyzer (build 33) ----------
   The old divider only ever spread a fixed template or the user's own
   pasted list — it never read the goal itself. The analyzer reads the
   goal's own words for countable work ("12 chapters", "3,000 words",
   "$600", "6 rooms") or a list in the title, and the plan is then built
   from that real work: steps name the actual chunk, sized by how long
   a unit really takes, grouped week by week. No countable work and no
   list → the calm category template below stays as the honest fallback. */
var UNIT_TABLE = [
  ["chapters?", "chapter", 25, "Read"], ["pages?", "page", 2, "Read"],
  ["lessons?", "lesson", 20, "Learn"], ["modules?", "module", 30, "Work through"],
  ["units?", "unit", 20, "Work through"], ["topics?", "topic", 15, "Cover"],
  ["lectures?", "lecture", 30, "Watch"], ["videos?", "video", 15, "Watch"],
  ["words?", "word", 0.12, "Write"], ["questions?", "question", 3, "Answer"],
  ["problems?", "problem", 4, "Solve"], ["exercises?", "exercise", 3, "Do"],
  ["flashcards?", "flashcard", 0.8, "Learn"], ["cards?", "card", 0.8, "Learn"],
  ["essays?", "essay", 60, "Write"], ["reports?", "report", 45, "Write"],
  ["emails?", "email", 4, "Write"], ["invoices?", "invoice", 6, "Send"],
  ["calls?", "call", 10, "Make"], ["applications?", "application", 20, "Send"],
  ["rooms?", "room", 20, "Tidy"], ["boxes?", "box", 5, "Pack"],
  ["bags?", "bag", 5, "Pack"], ["items?", "item", 5, "Sort"],
  ["songs?", "song", 10, "Practise"], ["verses?", "verse", 3, "Learn"],
  ["recipes?", "recipe", 25, "Cook"], ["plants?", "plant", 5, "Plant"],
  ["laps?", "lap", 2, "Swim"], ["km|kilometres?|kilometers?", "km", 8, "Cover"],
  ["miles?", "mile", 12, "Cover"]
];
var LEAD_VERBS = ["read", "write", "learn", "study", "do", "clean", "tidy", "sort", "save", "run", "walk", "practise", "practice", "make", "build", "finish", "complete", "watch", "answer", "solve", "pack", "cook", "plant", "send", "cover", "review", "prepare"];
function leadVerb(text) {
  var w = String(text || "").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
  return LEAD_VERBS.indexOf(w) >= 0 ? w.charAt(0).toUpperCase() + w.slice(1) : null;
}
function analyzeWork(text) {
  var s = String(text || "");
  var m = s.match(/\$\s?(\d[\d,]*)/) || s.match(/(\d[\d,]*)\s*dollars/i);
  if (m) { var dollars = parseInt(m[1].replace(/,/g, ""), 10); if (dollars >= 10) return { kind: "money", total: dollars }; }
  for (var i = 0; i < UNIT_TABLE.length; i++) {
    var row = UNIT_TABLE[i];
    var mm = s.match(new RegExp("(\\d[\\d,]*)[\\s-]*(?:" + row[0] + ")\\b", "i"));
    if (mm) {
      var total = parseInt(mm[1].replace(/,/g, ""), 10);
      if (total >= 2 && total <= 100000) return { kind: "count", total: total, unit: row[1], per: row[2], verb: leadVerb(s) || row[3] };
    }
  }
  return null;
}
function analyzeList(title) {
  var s = String(title || "").trim();
  if (!/,|\band\b/i.test(s)) return null;
  var body = s.replace(/^(please\s+)?(read|write|learn|study|do|clean|tidy|sort|save|make|build|finish|complete|prepare|organise|organize)\s+/i, "");
  var parts = body.split(/\s*,\s*|\s+and\s+/i).map(function (p) { return p.trim().replace(/^the\s+/i, ""); }).filter(function (p) { return p.length >= 3 && p.length <= 40; });
  if (parts.length < 2 || parts.length > 8) return null;
  return { kind: "list", items: parts.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }) };
}
/* Middle-step verbs that fit the kind of goal (the old set was
   school-shaped for everything — "Try 5 practice questions" on a
   money goal). School keeps the original six. */
var ROTATE_BY_CAT = {
  school: ROTATE,
  work: ["Do the next small piece of: ", "Move one step on: ", "Do 20 focused minutes on: ", "Clear the next blocker on: ", "Polish one part of: ", "Do one more small piece of: "],
  health: ["Do a gentle session of: ", "Keep going with: ", "A short, easy round of: ", "One more small step on: ", "Check in kindly with: ", "Keep it kind: "],
  money: ["Check the numbers on: ", "Make one small move on: ", "Move a little closer on: ", "Write down progress on: ", "Do the next small step on: ", "Review and adjust: "],
  home: ["Do the next corner of: ", "Tidy one more bit of: ", "Keep going on: ", "Sort one small part of: ", "One more small piece of: ", "Finish the next bit of: "],
  personal: ["Do the next small piece of: ", "Keep going with: ", "One small step on: ", "Move one bit further on: ", "Do a little more of: ", "Come back to: "],
  other: ["Do the next small piece of: ", "Keep going with: ", "One small step on: ", "Move one bit further on: ", "Do a little more of: ", "Come back to: "]
};
function mondayOf(k) { var wd = weekdayOf(k); return addDays(k, -((wd + 6) % 7)); }
/* Build steps from analyzed countable work. Steps run on consecutive
   plan days from the start; when the work is done the plan is done —
   the days after stay free (a bigger buffer, said out loud in the
   preview). Minutes are sized from the unit's real cost, aimed at the
   user's picked minutes; if the deadline forces chunks bigger than
   that, the plan says so (tight) instead of pretending. */
function buildCountSteps(opts, work, workDays) {
  var target = Math.max(10, Math.min(45, +opts.mins || 20));
  var steps = [], total = work.total, done = 0, di = 0;
  var byTime = work.kind === "money" ? Math.max(5, Math.round(total / Math.max(1, workDays.length))) : Math.max(1, Math.round(target / work.per));
  var needed = Math.ceil(total / Math.max(1, workDays.length));
  var perDay = Math.max(needed, byTime);
  var tight = work.kind !== "money" && perDay * work.per > target * 1.5;
  var weeks = [], weekSeen = {};
  while (done < total && di < workDays.length) {
    var n = Math.min(perDay, total - done), from = done + 1; done += n;
    var date = workDays[di]; di++;
    var lastWork = done >= total;
    var mins = work.kind === "money" ? target : Math.max(10, Math.min(60, Math.round(n * work.per)));
    var text;
    if (work.kind === "money") text = "Put $" + n + " aside ($" + done + " of $" + total + ")";
    else if (work.unit === "word") text = work.verb + " " + n + " words";
    else if (n === 1) text = work.verb + " " + work.unit + " " + from;
    else text = work.verb + " " + work.unit + "s " + from + "\u2013" + done;
    var wk = mondayOf(date);
    if (!weekSeen[wk]) { weekSeen[wk] = { start: wk, from: from, to: done }; weeks.push(weekSeen[wk]); } else weekSeen[wk].to = done;
    steps.push({ date: date, title: text, durationMin: mins, minVersion: "Just 5 minutes: open it and do the first small bit of this.", chunk: { from: from, to: done }, weekStart: wk });
  }
  if (steps.length) {
    var lastIdx = steps.length - 1;
    for (var i = 0; i < steps.length; i++) {
      var review = i !== lastIdx && (i + 1) % 7 === 0;
      if (review) steps[i].title = "Review: look at how far you have come on " + String(opts.title || "").trim();
    }
    steps[lastIdx].title = "Finish: " + String(opts.title || "").trim() + " (final look, then celebrate)";
  }
  var unitLabel = work.kind === "money" ? "$" + total + " saved" : total + " " + work.unit + (total === 1 ? "" : "s");
  var realMins = steps.length ? steps[0].durationMin : target;
  steps.analysis = { kind: work.kind, total: total, unit: work.unit || "$", verb: work.verb || "Put aside", tight: tight,
    weeks: weeks.map(function (w) { return work.kind === "money" ? { start: w.start, text: "$" + w.from + "\u2013$" + w.to } : { start: w.start, text: w.from === w.to ? work.unit + " " + w.from : work.unit + "s " + w.from + "\u2013" + w.to }; }),
    summary: unitLabel + " \u00b7 about " + realMins + " minutes a step" };
  return steps;
}

/* Which days are plan days. pace: "daily" | "weekdays" | "three" (Mon/Wed/Fri) */
function planDays(startKey, endKey, pace) {
  var out = [], span = diffDays(startKey, endKey);
  if (span < 0) return out;
  for (var i = 0; i <= Math.min(span, 400); i++) {
    var k = addDays(startKey, i), wd = weekdayOf(k);
    if (pace === "weekdays" && (wd === 0 || wd === 6)) continue;
    if (pace === "three" && wd !== 1 && wd !== 3 && wd !== 5) continue;
    out.push(k);
  }
  return out;
}

/* The plan: ONE small step per plan day. The last 10% of days are kept as a
   buffer (no step) so a slip never means failure; each 7th step is a short review. */
function buildPlan(opts) {
  var title = String(opts.title || "").trim();
  var mins = Math.max(5, Math.min(90, +opts.mins || 20));
  var days = planDays(opts.start, opts.end, opts.pace || "daily");
  if (!days.length) return [];
  var buffer = days.length >= 10 ? Math.floor(days.length * 0.1) : 0;
  var work = days.slice(0, days.length - buffer);
  var found = analyzeWork(opts.text || title);
  if (found) return buildCountSteps(opts, found, work);
  var list = analyzeList(title);
  var ms = list ? list.items : (opts.milestones && opts.milestones.length ? opts.milestones : parseMilestones("", opts.category));
  var steps = [], i;
  // spread milestones evenly across the working days
  var perM = Math.max(1, Math.floor(work.length / ms.length));
  var plan = [];
  for (i = 0; i < work.length; i++) plan.push({ m: Math.min(ms.length - 1, Math.floor(i / perM)), idx: 0, total: 0 });
  var counts = {}; plan.forEach(function (p) { counts[p.m] = (counts[p.m] || 0) + 1; });
  var seen = {}; plan.forEach(function (p) { seen[p.m] = (seen[p.m] || 0) + 1; p.idx = seen[p.m]; p.total = counts[p.m]; });
  for (i = 0; i < work.length; i++) {
    var p = plan[i], m = ms[p.m], last = i === work.length - 1, review = !last && (i + 1) % 7 === 0;
    var text;
    if (last) text = "Finish: " + title + " (final look, then celebrate)";
    else if (review) text = "Review: look at how far you have come on " + title;
    else if (p.total === 1) text = m;
    else if (p.idx === 1) text = "Start: " + m;
    else if (p.idx === p.total) text = "Finish this part: " + m;
    else text = (ROTATE_BY_CAT[opts.category] || ROTATE)[(p.idx - 2) % ROTATE.length] + m;
    steps.push({
      date: work[i], title: text.length > 120 ? text.slice(0, 117) + "…" : text, durationMin: mins,
      minVersion: "Just 5 minutes: open it and do the first small bit of this."
    });
  }
  return steps;
}

/* Progress for one goal from the tasks tied to it (goalId). */
function goalProgress(goal, tasks, today) {
  var mine = (tasks || []).filter(function (t) { return t && t.goalId === goal.id; });
  var done = mine.filter(function (t) { return t.status === "done"; });
  var dueByNow = mine.filter(function (t) { return t.date <= today; });
  var behind = mine.filter(function (t) { return t.date < today && t.status !== "done"; });
  var days = {}; done.forEach(function (t) { days[t.doneOn || t.date] = true; });
  var next = mine.filter(function (t) { return t.status !== "done" && t.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })[0] || null;
  var total = mine.length;
  var pct = total ? Math.round(done.length * 100 / total) : 0;
  var state = total && done.length === total ? "complete" : behind.length >= 3 ? "behind" : behind.length ? "slightly" : "on-track";
  return { total: total, done: done.length, pct: pct, dueByNow: dueByNow.length, behind: behind.length, activeDays: Object.keys(days).length, next: next, daysLeft: goal.end ? Math.max(0, diffDays(today, goal.end)) : null, state: state };
}

/* Move every unfinished step that is overdue (and the future ones) onto the remaining plan days. */
function replan(goal, tasks, today) {
  var open = (tasks || []).filter(function (t) { return t.goalId === goal.id && t.status !== "done"; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (!open.length) return { moved: 0, failed: false };
  var start = today > goal.start ? today : goal.start;
  var days = planDays(start, goal.end, goal.pace || "daily");
  if (!days.length) days = [today]; // past the end date: put them on from today, one a day
  var k = 0, moved = 0;
  open.forEach(function (t, i) {
    var d = days[i] || addDays(days[days.length - 1], i - days.length + 1);
    if (t.date !== d) { t.date = d; moved++; }
  });
  return { moved: moved, failed: open.length > days.length };
}

/* ---------- habits: forgiving streaks ---------- */
function weekDays(today) { // Monday first, current week
  var wd = weekdayOf(today), back = (wd + 6) % 7, names = ["M", "T", "W", "T", "F", "S", "S"], full = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], out = [];
  for (var i = 0; i < 7; i++) { var k = addDays(today, i - back); out.push({ key: k, label: names[i], name: full[i], future: k > today, today: k === today }); }
  return out;
}
function habitStats(days, today) {
  days = days || {};
  var keys = Object.keys(days).filter(function (k) { return days[k] && k <= today; }).sort();
  var total = keys.length;
  // current run: count done days walking back; a run ends after TWO missed days in a row
  var cur = 0, misses = 0, k = days[today] ? today : addDays(today, -1), guard = 0;
  var strict = 0, ks = k;
  while (days[ks]) { strict++; ks = addDays(ks, -1); }
  while (guard++ < 800) {
    if (days[k]) { cur++; misses = 0; } else { misses++; if (misses >= 2) break; }
    k = addDays(k, -1);
    if (keys.length && k < keys[0]) break;
    if (!keys.length) break;
  }
  var best = 0, run = 0;
  keys.forEach(function (key, i) {
    if (i && diffDays(keys[i - 1], key) <= 2) run++; else run = 1;
    if (run > best) best = run;
  });
  if (cur > best) best = cur;
  var wk = weekDays(today), weekDone = wk.filter(function (d) { return days[d.key]; }).length;
  var yDone = !!days[addDays(today, -1)], tDone = !!days[today], d2 = !!days[addDays(today, -2)];
  return { current: cur, strict: strict, best: best, total: total, weekDone: weekDone, doneToday: tDone,
    missedYesterday: !yDone && !tDone && d2 && total > 0, lapsed: !tDone && !yDone && !d2 && total > 0 };
}
/* Kind words, each tied to the research (see "Why this works" in the app). */
function habitMessage(s) {
  if (!s.total) return "Start tiny. The first few repeats build the most.";
  if (s.missedYesterday) return "One missed day barely matters. Never miss twice: do your smallest version today.";
  if (s.lapsed) return "Welcome back. A slip does not erase what you built. Do the smallest version to restart.";
  var c = s.current;
  if (c >= 66) return c + " days. Past the 66-day average for a habit to feel automatic.";
  if (c >= 30) return c + " days. This is turning into who you are.";
  if (c >= 21) return c + " days. Three weeks of showing up.";
  if (c >= 14) return c + " days. Two weeks. The hard bit is behind you.";
  if (c >= 7) return "A full week. Early repeats build the most automatic feeling.";
  if (c >= 3) return c + " days in. Keep it easy, keep it going.";
  if (s.doneToday) return "Done today. That counts.";
  return "One tick today keeps it going.";
}

var api = { GOAL_CATEGORIES: GOAL_CATEGORIES, goalCategory: goalCategory, parseMilestones: parseMilestones, planDays: planDays, buildPlan: buildPlan, analyzeWork: analyzeWork, analyzeList: analyzeList,
  goalProgress: goalProgress, replan: replan, weekDays: weekDays, habitStats: habitStats, habitMessage: habitMessage, diffDays: diffDays };
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.PaceGoals = api;
})(typeof window !== "undefined" ? window : globalThis);
