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

/* ---------- the business / revenue planner (build 34) ----------
   "Reach $5000 revenue this month": Pace does the funnel maths out loud.
   price of one sale (the user's, or a stated guess) -> sales needed ->
   about 10 reach-outs per sale -> messages a day. Each plan day gets
   four small blocks at fixed times, so the calendar shows WHEN, not just WHAT.
   No AI: plain maths, and the preview says which numbers are guesses. */
var tr = function (s, v) { var f = root.t; if (f) return f(s, v); return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
function analyzeRevenue(text) {
  var s = String(text || "");
  if (!/(revenue|sales|income|customers?|clients?|business|profit|earn|sell|store|shop|startup|side hustle|freelanc|mrr)/i.test(s)) return null;
  if (/\bsav(e|ing|ings)\b/i.test(s)) return null;
  var m = s.match(/\$\s?(\d[\d,.]*)\s*(k)?/i) || s.match(/(\d[\d,.]*)\s*(k)?\s*(?:dollars|usd|aud|a\$|in revenue|revenue|in sales|in income)/i) || s.match(/\b(\d[\d,]{2,})\s*(k)?\b/i);
  if (!m) return null;
  var n = parseFloat(m[1].replace(/,/g, ""));
  if (m[2]) n *= 1000;
  n = Math.round(n);
  return n >= 100 ? { kind: "revenue", total: n } : null;
}
var WHEN_TIME = { morning: "08:30", midday: "12:30", evening: "18:30" };
var REV_TIMES = { morning: ["09:00", "11:00", "12:30", "13:30"], midday: ["12:00", "14:00", "16:30", "17:30"], evening: ["18:00", "18:40", "19:10", "19:40"], auto: ["09:00", "13:00", "16:30", "17:30"] };
function buildRevenueSteps(opts, work, days) {
  var ans = opts.answers || {}, RT = REV_TIMES[ans.when] || REV_TIMES.auto;
  var custMult = ans.customers === "none" ? 1.3 : ans.customers === "many" ? 0.7 : 1;
  var total = work.total, n = days.length;
  var guess = !(+opts.price > 0);
  var price = guess ? Math.max(10, Math.min(1000, Math.round(total / 25 / 5) * 5)) : Math.round(+opts.price);
  var sales = Math.max(1, Math.ceil(total / price));
  var msgsDay = Math.max(3, Math.ceil(sales * 10 * custMult / Math.max(1, n)));
  var follow = Math.max(1, Math.ceil(msgsDay / 3));
  var steps = [], weeks = [], weekSeen = {}, typical = null;
  days.forEach(function (date, i) {
    var target = Math.round(total * (i + 1) / n), wk = mondayOf(date);
    var list = [];
    if (i === 0) {
      list.push({ time: RT[0], min: 30, title: tr("Write your offer in one sentence and set the price (about ${p})", { p: price }) });
      list.push({ time: RT[1], min: 30, title: tr("List {n} people who could buy from you", { n: msgsDay * 3 }) });
    } else {
      list.push({ time: RT[0], min: Math.max(15, Math.min(45, msgsDay * 3)), title: tr("Reach out to {n} people about your offer", { n: msgsDay }) });
      list.push({ time: RT[1], min: 20, title: tr("Follow up with {n} people who answered", { n: follow }) });
    }
    list.push({ time: RT[2], min: 20, title: tr("Share one post that shows your offer") });
    var lastDay = i === n - 1, endWeek = lastDay || weekdayOf(days[i + 1]) === 1 || mondayOf(days[i + 1]) !== wk;
    list.push({ time: RT[3], min: 10, title: lastDay ? tr("Finish: count your sales. Goal ${t} (final look, then celebrate)", { t: total }) : tr("Count today: aim for ${t} so far", { t: target }) });
    if (endWeek && !lastDay) list.push({ time: "20:00", min: 20, title: tr("Weekly review: what sold, what to change next week") });
    if (i === 1) typical = list.slice(0, 4);
    list.forEach(function (it) {
      steps.push({ date: date, time: it.time, title: it.title, durationMin: it.min, minVersion: tr("Just 5 minutes: do the very first bit of this."), weekStart: wk });
    });
    if (!weekSeen[wk]) { weekSeen[wk] = { start: wk, to: target }; weeks.push(weekSeen[wk]); } else weekSeen[wk].to = target;
  });
  if (!typical) typical = steps.slice(0, 4);
  steps.analysis = { kind: "revenue", total: total, unit: "$", tight: false,
    weeks: weeks.map(function (w) { return { start: w.start, text: tr("aim for ${t} by the end of this week", { t: w.to }) }; }),
    typicalDay: typical.map(function (s) { return { time: s.time, title: s.title }; }),
    summary: tr("${t} goal, about {s} sales at ${p} each, about {m} reach-outs a day", { t: total, s: sales, p: price, m: msgsDay }),
    guess: guess ? tr("The ${p} price of one sale is a guess. Type your real price and make the plan again.", { p: price }) : "" };
  return steps;
}

/* ---------- playbooks (build 34): Pace reads WHAT the goal is ----------
   Each kind of goal has its own real stages, in order, with real actions and
   a time of day that suits the work. "Learn Spanish" and "lose 5 kg" are not
   cut into the same pieces. Plain rules, no AI, and the preview says so. */
var PLAYBOOKS = [
  { id: "launch", label: "launch", re: /\b(launch|start|build|create|open|grow)\b.*\b(app|website|site|product|shop|store|brand|channel|newsletter|podcast|startup|course|page|business|agency|service)\b/i,
    phases: [
      { name: "Decide", share: 0.15, time: "09:00", min: 30, acts: ["Write who {t} is for, in one sentence", "List the 3 problems {t} solves", "Look at 3 similar things and note what they miss", "Choose the one thing {t} must do first"] },
      { name: "Build the first version", share: 0.4, time: "09:00", min: 45, acts: ["Build the next small piece of {t}", "Finish one screen, page or part of {t}", "Fix the biggest gap in {t}", "Write the words people will read on {t}"] },
      { name: "Show it to real people", share: 0.25, time: "13:00", min: 30, acts: ["Show {t} to one real person and write down what they say", "Ask 3 people what is confusing about {t}", "Fix the top thing people said about {t}"] },
      { name: "Launch", share: 0.2, time: "10:00", min: 30, acts: ["Tell 10 people about {t}", "Post {t} where your people hang out", "Reply to everyone who answered about {t}", "Write down what worked this week for {t}"] }] },
  { id: "exam", label: "exam", re: /\b(exam|test|quiz|assessment|finals?|certificate|certification|licen[sc]e)\b/i,
    phases: [
      { name: "Plan", share: 0.1, time: "09:00", min: 30, acts: ["Find out what {t} covers and when it is", "List every topic in {t} and mark the shaky ones", "Gather notes, readings and past papers for {t}"] },
      { name: "Learn each topic", share: 0.5, time: "09:00", min: 40, acts: ["Learn the next topic for {t}", "Write 5 key points from today's topic for {t}", "Say today's topic for {t} back without notes", "Make 5 flashcards for {t}"] },
      { name: "Practise", share: 0.3, time: "15:00", min: 40, acts: ["Do 10 practice questions for {t}", "Do one past paper section for {t}", "Mark your answers and fix the mistakes for {t}"] },
      { name: "Final review", share: 0.1, time: "09:00", min: 30, acts: ["Review your weakest topics for {t}", "Light review of {t}, then rest well"] }] },
  { id: "learn", label: "learning", re: /\b(learn|speak|study|master|practi[sc]e|get (good|better|fluent)|play (the )?(guitar|piano|violin|drums|ukulele)|fluent)\b/i,
    phases: [
      { name: "Set up", share: 0.1, time: "08:00", min: 20, acts: ["Pick one course, book or teacher for {t}", "Set up a spot and a daily time for {t}", "Write what you can already do in {t}"] },
      { name: "Basics", share: 0.4, time: "08:00", min: 20, acts: ["Learn the next small piece of {t}", "Repeat yesterday's piece of {t} from memory", "Do 10 minutes of {t} out loud or by hand", "Write down 5 things you learned in {t}"] },
      { name: "Use it", share: 0.35, time: "18:30", min: 25, acts: ["Use {t} for real: talk, play or write for 15 minutes", "Record yourself doing {t} and listen back", "Do one small test of {t}", "Fix the one thing that went wrong in {t}"] },
      { name: "Show it", share: 0.15, time: "18:30", min: 30, acts: ["Do {t} with another person", "Do a full run-through of {t} without stopping", "Write what to learn next in {t}"] }] },
  { id: "fitness", label: "fitness", quote: true, re: /\b(lose|gain|weigh|kg|kilo|pounds?|lbs|fit|fitness|gym|run|running|marathon|5k|10k|workout|muscle|strength|walk|swim|yoga|get stronger|healthy)\b/i,
    phases: [
      { name: "Start easy", share: 0.25, time: "06:30", min: 20, acts: ["Easy session for {t}: stop while it still feels easy", "Walk for 20 minutes for {t}", "Prepare tomorrow's food and clothes for {t}"] },
      { name: "Build", share: 0.4, time: "06:30", min: 30, acts: ["Session for {t}: a little more than last time", "Strength or stretch for 20 minutes for {t}", "Walk or move for 30 minutes for {t}", "Plan this week's meals for {t}"] },
      { name: "Push a little", share: 0.25, time: "06:30", min: 35, acts: ["Longer session for {t}", "Hard but short session for {t}", "Easy recovery session for {t}"] },
      { name: "Check and finish", share: 0.1, time: "07:00", min: 30, acts: ["Measure where you are on {t} and write it down", "Final session for {t}, then look back"] }] },
  { id: "write", label: "writing", re: /\b(write|book|novel|thesis|dissertation|essay|blog|article|script|memoir|screenplay)\b/i,
    phases: [
      { name: "Plan", share: 0.15, time: "09:00", min: 30, acts: ["Write the one-line point of {t}", "Outline the parts of {t} on one page", "List what you still need to look up for {t}"] },
      { name: "Draft", share: 0.55, time: "09:00", min: 45, acts: ["Write the next part of {t}. Do not edit yet", "Write 300 words of {t}", "Write the part of {t} you are most excited about"] },
      { name: "Edit", share: 0.25, time: "10:00", min: 40, acts: ["Read one part of {t} out loud and fix it", "Cut what does not help {t}", "Fix the weakest part of {t}"] },
      { name: "Finish", share: 0.05, time: "10:00", min: 30, acts: ["Final read of {t}, then share it"] }] },
  { id: "job", label: "job search", re: /\b(job|career|interview|resume|cv|apply|applications?|hired|promotion|new role)\b/i,
    phases: [
      { name: "Get ready", share: 0.2, time: "09:00", min: 40, acts: ["Update your CV for {t}", "Write 3 sentences about what you want, for {t}", "List 20 places you would like to work, for {t}"] },
      { name: "Apply and reach out", share: 0.5, time: "09:00", min: 40, acts: ["Send 3 applications for {t}", "Message 3 people who work where you want, for {t}", "Follow up on last week's applications for {t}"] },
      { name: "Practise", share: 0.2, time: "15:00", min: 30, acts: ["Practise 3 interview answers out loud for {t}", "Do one mock interview for {t}"] },
      { name: "Close", share: 0.1, time: "09:00", min: 30, acts: ["Follow up on every open application for {t}", "Write down what you learned searching for {t}"] }] },
  { id: "home", label: "home", re: /\b(declutter|clean|tidy|organi[sz]e|move house|moving|renovat|garage|wardrobe|closet|spring clean)\b/i,
    phases: [
      { name: "Look", share: 0.1, time: "10:00", min: 20, acts: ["Walk through and list every area for {t}", "Gather bags, boxes and cleaning things for {t}"] },
      { name: "Do it area by area", share: 0.8, time: "10:00", min: 30, acts: ["Do the next area of {t}", "Sort one shelf, drawer or corner for {t}", "Take one bag to donate or throw away for {t}"] },
      { name: "Finish", share: 0.1, time: "10:00", min: 30, acts: ["Final tidy and walk-through for {t}"] }] }
];
function subjectOf(title) {
  var s = String(title || "").trim().replace(/^(i (really )?(want|need|would like|plan|am going) to|my goal is to|help me|please)\s+/i, "");
  s = s.replace(/\s+(this|next)\s+(week|month|year|semester|quarter)\b.*$/i, "").replace(/\s+by\s+.*$/i, "").replace(/[.!?]+$/, "");
  s = s.charAt(0).toLowerCase() + s.slice(1);
  return s.length > 48 ? s.slice(0, 45).replace(/\s+\S*$/, "") + "..." : s;
}
function nounOf(title) {
  var s = subjectOf(title).replace(/^(learn|lose|launch|start|build|create|open|grow|write|get|declutter|clean|tidy|organi[sz]e|pass|study|master|practi[sc]e|improve|finish|complete|prepare for|prepare)\s+(to\s+)?/i, "").trim();
  return s.length >= 2 ? s : subjectOf(title);
}
function findPlaybook(text, category) {
  var s = String(text || "");
  for (var i = 0; i < PLAYBOOKS.length; i++) if (PLAYBOOKS[i].re.test(s)) return PLAYBOOKS[i];
  return null;
}
function buildPlaybookSteps(opts, pb, days) {
  var t = pb.quote ? "\u201c" + subjectOf(opts.title) + "\u201d" : nounOf(opts.title), n = days.length, steps = [], phaseRanges = [], cut = 0, pi, i;
  var lvl = (opts.answers || {}).level, sh = pb.phases.map(function (p) { return p.share; });
  if (lvl === "some") sh[0] *= 0.5; else if (lvl === "lots") { sh[0] *= 0.2; if (sh.length > 2) sh[1] *= 0.7; }
  var shSum = sh.reduce(function (x, y) { return x + y; }, 0); sh = sh.map(function (x) { return x / shSum; });
  var counts = pb.phases.map(function (p, k) { return k === pb.phases.length - 1 ? 0 : Math.max(1, Math.round(sh[k] * n)); });
  var used = counts.reduce(function (a, b) { return a + b; }, 0);
  counts[counts.length - 1] = Math.max(1, n - used);
  var mult = Math.max(0.5, Math.min(2, (+opts.mins || 20) / 25));
  for (pi = 0; pi < pb.phases.length; pi++) {
    var ph = pb.phases[pi], from = cut, to = Math.min(n, cut + counts[pi]);
    cut = to; if (to <= from) continue;
    phaseRanges.push({ name: ph.name, from: days[from], to: days[to - 1] });
    for (i = from; i < to; i++) {
      var a = ph.acts[(i - from) % ph.acts.length];
      var last = i === n - 1, review = !last && weekdayOf(days[i]) === 0;
      var title = last ? tr("Finish: {t}. Final look, then celebrate", { t: t }) : review ? tr("Weekly review: what worked on {t} and what to change", { t: t }) : tr(a, { t: t });
      steps.push({ date: days[i], time: review || last ? "17:30" : ph.time, title: title.charAt(0).toUpperCase() + title.slice(1), durationMin: review ? 20 : Math.max(10, Math.round(ph.min * mult / 5) * 5),
        minVersion: tr("Just 5 minutes: do the very first bit of this."), weekStart: mondayOf(days[i]), phase: ph.name });
    }
  }
  steps.analysis = { kind: "playbook", total: n, unit: "", tight: false,
    weeks: phaseRanges.map(function (r) { return { start: r.from, text: tr(r.name) + " " + tr("until") + " " + r.to.slice(5) }; }),
    summary: tr("Pace read this as a {k} goal: {n} stages, one clear step a day", { k: tr(pb.label), n: phaseRanges.length }),
    typicalDay: null,
    guess: tr("These stages are Pace's own rules for {k} goals, not AI. Change any step in your calendar.", { k: tr(pb.label) }) };
  return steps;
}


/* ---------- follow-up questions (build 34) ----------
   Pace asks 2 or 3 short questions that really change the plan, then builds it.
   Every question can be skipped. Rules only, no AI. */
var WHEN_Q = { id: "when", label: "When in the day suits you best?", options: [{ v: "", l: "Let Pace choose" }, { v: "morning", l: "Morning" }, { v: "midday", l: "Midday" }, { v: "evening", l: "Evening" }] };
var LEVEL_Q = {
  launch: { label: "Where are you now?", options: [{ v: "", l: "Just an idea" }, { v: "some", l: "I have a rough version" }, { v: "lots", l: "It is already live" }] },
  learn: { label: "What is your level?", options: [{ v: "", l: "Brand new" }, { v: "some", l: "I know some" }, { v: "lots", l: "Fairly good already" }] },
  fitness: { label: "How active are you now?", options: [{ v: "", l: "Not active" }, { v: "some", l: "Sometimes" }, { v: "lots", l: "Often" }] },
  write: { label: "Where are you now?", options: [{ v: "", l: "Nothing yet" }, { v: "some", l: "I have an outline" }, { v: "lots", l: "I have a draft" }] },
  job: { label: "Is your CV ready?", options: [{ v: "", l: "No" }, { v: "some", l: "Nearly" }, { v: "lots", l: "Yes" }] },
  home: { label: "How big is the job?", options: [{ v: "", l: "Big" }, { v: "some", l: "Medium" }, { v: "lots", l: "Small" }] },
  exam: { label: "How ready do you feel?", options: [{ v: "", l: "Not ready" }, { v: "some", l: "Part way" }, { v: "lots", l: "Nearly there" }] }
};
function questionsFor(title, text, category, notes) {
  var own = String(notes || "").split(/\r\n|\n|\r/).filter(function (l) { return l.trim().length >= 3; }).length;
  if (own >= 3) return [];
  var t = String(title || ""), full = text || t;
  if (analyzeRevenue(full)) return [
    { id: "customers", label: "Do you already have customers?", options: [{ v: "", l: "A few" }, { v: "none", l: "Not yet" }, { v: "many", l: "Many" }] },
    { id: "price", label: "Price of one sale (optional)", type: "number", placeholder: "e.g. 100" }, WHEN_Q];
  if (analyzeWork(full) || analyzeList(t)) return [WHEN_Q];
  var pb = findPlaybook(t);
  if (pb) { var lq = LEVEL_Q[pb.id]; return [{ id: "level", label: lq.label, options: lq.options }, WHEN_Q]; }
  return [
    { id: "done", label: "What does done look like? One sentence (optional)", type: "text", placeholder: "e.g. The wedding is booked and paid" },
    { id: "parts", label: "Name the main parts, separated by commas (optional)", type: "text", placeholder: "e.g. venue, guest list, food, music" }, WHEN_Q];
}
function buildPlan(opts) {
  var steps = buildPlanCore(opts), w = (opts.answers || {}).when, wt = WHEN_TIME[w];
  if (wt) steps.forEach(function (s) {
    if (!s.time) s.time = wt;
    else if (s.phase && !/^(Weekly review|Finish)/.test(s.title)) s.time = wt;
  });
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
function buildPlanCore(opts) {
  var title = String(opts.title || "").trim();
  var mins = Math.max(5, Math.min(90, +opts.mins || 20));
  var days = planDays(opts.start, opts.end, opts.pace || "daily");
  if (!days.length) return [];
  var buffer = days.length >= 10 ? Math.floor(days.length * 0.1) : 0;
  var work = days.slice(0, days.length - buffer);
  var rv = analyzeRevenue(opts.text || title);
  if (rv) return buildRevenueSteps(opts, rv, work);
  var found = analyzeWork(opts.text || title);
  if (found) return buildCountSteps(opts, found, work);
  var ownLines = String(opts.text || "").split(/\r\n|\n|\r/).filter(function (l) { return l.trim().length >= 3; }).length;
  var pbk = (ownLines >= 4 || (opts.milestones && opts.milestones.length) || analyzeList(title)) ? null : findPlaybook(title);
  if (pbk) return buildPlaybookSteps(opts, pbk, work);
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

var api = { GOAL_CATEGORIES: GOAL_CATEGORIES, goalCategory: goalCategory, parseMilestones: parseMilestones, planDays: planDays, buildPlan: buildPlan, analyzeWork: analyzeWork, analyzeRevenue: analyzeRevenue, questionsFor: questionsFor, findPlaybook: findPlaybook, PLAYBOOKS: PLAYBOOKS, analyzeList: analyzeList,
  goalProgress: goalProgress, replan: replan, weekDays: weekDays, habitStats: habitStats, habitMessage: habitMessage, diffDays: diffDays };
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.PaceGoals = api;
})(typeof window !== "undefined" ? window : globalThis);
