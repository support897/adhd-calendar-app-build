/* ADHD Calendar logic. Pure functions, shared by the app and the node tests.
   No shame rules live here: nothing in this file ever labels a task late,
   failed or missed. Parked means parked, never dropped. */
(function (root) {
"use strict";
var tr = window.t; /* the language layer (i18n.js) */

function pad(n) { return (n < 10 ? "0" : "") + n; }
function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseKey(key) { var p = String(key).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(key, n) { var d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d); }
function todayKey(now) { return toKey(now || new Date()); }
function toMin(hhmm) { if (!hhmm) return null; var p = String(hhmm).split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
function toHHMM(mins) { mins = ((mins % 1440) + 1440) % 1440; return pad(Math.floor(mins / 60)) + ":" + pad(mins % 60); }

/* Start nudge time: the task block begins at its time, so the nudge lands a
   short setup lead-in before it (default 5 minutes, user changeable). */
function nudgeTime(task, setupMin) {
  if (!task.time) return null;
  return toHHMM(toMin(task.time) - (setupMin == null ? 5 : setupMin));
}

var CATEGORIES = [
  { id: "money",   label: "Finance",  words: ["pay", "bill", "invoice", "bank", "tax", "rent", "budget", "quote", "price", "refund", "insurance", "savings", "loan", "salary", "mortgage", "super"], color: "#C9920E" },
  { id: "pets",    label: "Pets",     words: ["dog", "cat ", "cats", "pet ", "pets", "puppy", "kitten", "litter", "groomer", "walk the dog", "feed the"], color: "#A0764B" },
  { id: "health",  label: "Health",   words: ["doctor", "dentist", "medicine", "tablet", "pills", "gym", "walk", "run", "yoga", "therapist", "therapy", "physio", "vet", "appointment", "checkup", "check-up", "exercise", "swim", "stretch", "scan"], color: "#E85D75" },
  { id: "family",  label: "Family",   words: ["family", "kids", "kid ", "son ", "daughter", "mum", "mom", "dad", "grandma", "grandpa", "nan ", "baby", "parent", "sister", "brother", "school run", "bedtime story"], color: "#D96AA7" },
  { id: "school",  label: "School",   words: ["study", "exam", "homework", "assignment", "lecture", "essay", "revise", "revision", "uni ", "semester", "tutorial", "quiz", "course", "thesis", "school", "class "], color: "#2F80ED" },
  { id: "work",    label: "Work",     words: ["work", "meeting", "email", "report", "client", "boss", "presentation", "spreadsheet", "call the office", "deadline", "project", "interview", "shift"], color: "#5B6BD5" },
  { id: "home",    label: "Home",     words: ["clean", "tidy", "wash", "laundry", "kitchen", "bedroom", "bins", "garden", "cook", "dishes", "vacuum", "mop", "repair", "fix the"], color: "#35704E" },
  { id: "travel",  label: "Travel",   words: ["flight", "hotel", "passport", "pack ", "packing", "trip", "holiday", "visa", "train", "airport", "booking"], color: "#00A3C4" },
  { id: "people",  label: "Friends",  words: ["call", "visit", "birthday", "friend", "pick up", "pickup", "message", "text", "party", "dinner with", "coffee with", "catch up"], color: "#F2994A" },
  { id: "errands", label: "Errands",  words: ["shop", "groceries", "buy", "post office", "pharmacy", "petrol", "fuel", "drop off", "collect", "return the"], color: "#20A39E" },
  { id: "creative",label: "Creative", words: ["paint", "draw", "guitar", "piano", "practise", "practice", "craft", "photo", "design", "sketch", "journal", "compose"], color: "#C158DC" },
  { id: "rest",    label: "Rest",     words: ["rest", "nap", "read", "bath", "breathe", "meditate", "break", "sit outside", "relax"], color: "#8E7CC3" }
];
var DEFAULT_COLOR = "#7A8699";
/* Prefix-on-a-word match: "run" finds "running" but not "prune"; a trailing
   space in a word means "that whole word" ("cat " is not "category"). */
function wordHit(t, w) {
  var exact = /\s$/.test(w), core = w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z])" + core + (exact ? "([^a-z]|$)" : "")).test(t);
}
function categoryFor(title) {
  var t = String(title).toLowerCase();
  for (var i = 0; i < CATEGORIES.length; i++) {
    for (var j = 0; j < CATEGORIES[i].words.length; j++) {
      if (wordHit(t, CATEGORIES[i].words[j])) return { id: CATEGORIES[i].id, color: CATEGORIES[i].color, label: CATEGORIES[i].label };
    }
  }
  return { id: "general", color: DEFAULT_COLOR, label: "Other" };
}
var CATEGORY_LIST = CATEGORIES.map(function (c) { return { id: c.id, label: c.label, color: c.color }; }).concat([{ id: "general", label: "Other", color: DEFAULT_COLOR }]);

function estimateDuration(title) {
  var t = String(title).toLowerCase();
  if (/\b(email|message|text|reply|call|phone)\b/.test(t)) return 10;
  if (/\b(clean|tidy|organise|organize|declutter|laundry|garden)\b/.test(t)) return 30;
  if (/\b(shop|groceries|appointment|doctor|dentist|meeting)\b/.test(t)) return 45;
  if (/\b(write|report|plan|study|pack|prep)\b/.test(t)) return 45;
  return 25;
}

var UMBRELLA = /\b(clean|tidy|organise|organize|declutter|sort out|sort|plan|fix|write|study|pack|prep|prepare|build|set up|deal with)\b/i;
function isBig(title, durationMin) {
  /* A fixed appointment is never a "big task", however long it runs. */
  if (/\b(appointment|meeting|flight|lesson|class|shift|interview)\b/i.test(title)) return false;
  return durationMin >= 90 || UMBRELLA.test(title) || (/\band\b/i.test(title) && title.split(/\s+/).length >= 6);
}
/* Starter steps: small, physical, verb first. Always editable in the app. */
function decompose(title, durationMin, force) {
  if (!force && !isBig(title, durationMin)) return [];
  var short = String(title).replace(/\s+/g, " ").trim();
  if (short.length > 42) short = short.slice(0, 42) + "…";
  return [
    { text: tr("Get out what you need for: {title}", { title: short }), done: false },
    { text: tr("Do the first small part for 10 minutes"), done: false },
    { text: tr("Put things away, then write the next step"), done: false }
  ];
}

var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function nextWeekday(baseKey, wd, strictlyAfter) {
  var d = parseKey(baseKey);
  var diff = (wd - d.getDay() + 7) % 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  d.setDate(d.getDate() + diff);
  return toKey(d);
}

/* An impossible date key (2027-02-29, 2027-04-31) matches no real
   day in any view — the task would exist nowhere. Normalise at the
   parser's choke point: Feb 29 rolls forward to the next leap year;
   any other overflow clamps to the month's real last day (PACE-009). */
function realDate(key) {
  var p = String(key).split("-"); var y = +p[0], m = +p[1], d = +p[2];
  if (!y || m < 1 || m > 12 || !d) return key;
  var dim = new Date(y, m, 0).getDate();
  if (d <= dim) return key;
  if (m === 2 && d === 29) { do { y++; dim = new Date(y, 2, 0).getDate(); } while (dim < 29); return y + "-02-29"; }
  return y + "-" + pad(m) + "-" + pad(dim);
}

function parseItem(raw, baseKey) {
  var s = " " + String(raw).trim().replace(/\s+/g, " ") + " ";
  if (s.trim().length < 1) return null;
  var priority = 0;
  var bang = s.match(/(!+)\s*$/);
  if (bang) { priority = Math.min(3, bang[1].length); s = s.replace(/!+\s*$/, " "); }
  s = s.replace(/^\s*(task|todo|reminder)\s*[:\-]\s*/i, " ");
  s = s.replace(/\b(remind me to|i need to|need to|remember to)\b/i, " ");
  var repeat = null;
  var rm = s.match(/\bevery (day|weekday|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|night)\b/i);
  if (rm) { var rw = rm[1].toLowerCase(); repeat = (rw === "morning" || rw === "evening" || rw === "night") ? "every day" : "every " + rw; s = s.replace(rm[0], " "); }
  else if (/\bdaily\b/i.test(s)) { repeat = "every day"; s = s.replace(/\bdaily\b/i, " "); }
  else if (/\bweekly\b/i.test(s)) { repeat = "every week"; s = s.replace(/\bweekly\b/i, " "); }

  var date = baseKey, dm;
  if (/\bday after tomorrow\b/i.test(s)) { date = addDays(baseKey, 2); s = s.replace(/\bday after tomorrow\b/i, " "); }
  else if (/\btomorrow\b/i.test(s)) { date = addDays(baseKey, 1); s = s.replace(/\btomorrow\b/i, " "); }
  else if (/\btonight\b/i.test(s)) { s = s.replace(/\btonight\b/i, " at 7pm "); }
  else if (/\btoday\b/i.test(s)) { s = s.replace(/\btoday\b/i, " "); }
  else if ((dm = s.match(/\bin (\d+) days?\b/i))) { date = addDays(baseKey, +dm[1]); s = s.replace(dm[0], " "); }
  else if ((dm = s.match(/\b(?:on\s+)?next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i))) { date = nextWeekday(baseKey, WEEKDAYS.indexOf(dm[1].toLowerCase()), true); if ((parseKey(date) - parseKey(baseKey)) / 86400000 < 7) date = addDays(date, 7); s = s.replace(dm[0], " "); }
  else if ((dm = s.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i))) { date = nextWeekday(baseKey, WEEKDAYS.indexOf(dm[1].toLowerCase().slice(0, 3) === "mon" ? "monday" : dm[1].toLowerCase()), false); if (date === baseKey) { /* same weekday means today */ } s = s.replace(dm[0], " "); }
  else if ((dm = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { date = dm[1] + "-" + dm[2] + "-" + dm[3]; s = s.replace(dm[0], " "); }
  else if ((dm = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { var yr = dm[3] ? (+dm[3] < 100 ? 2000 + (+dm[3]) : +dm[3]) : parseKey(baseKey).getFullYear(); date = yr + "-" + pad(+dm[2]) + "-" + pad(+dm[1]); s = s.replace(dm[0], " "); }
  else if ((dm = s.match(/\b(?:on\s+)?(\d{1,2}) (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?\b/i))) { var monWord = dm[2].toLowerCase(); var mo = MONTHS.indexOf(monWord.length > 3 ? monWord : ({ jan: "january", feb: "february", mar: "march", apr: "april", jun: "june", jul: "july", aug: "august", sep: "september", oct: "october", nov: "november", dec: "december" }[monWord] || monWord)); var y2 = dm[3] ? +dm[3] : parseKey(baseKey).getFullYear(); var cand = y2 + "-" + pad(mo + 1) + "-" + pad(+dm[1]); if (!dm[3] && cand < baseKey) cand = (y2 + 1) + "-" + pad(mo + 1) + "-" + pad(+dm[1]); date = cand; s = s.replace(dm[0], " "); }

  var time = null, tm;
  if ((tm = s.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)) || (tm = s.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)\b/i)) || (tm = s.match(/\b(\d{1,2})(am|pm)\b/i)) || (tm = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) {
    var h = +tm[1], mi = +(tm[2] || 0), ap = (tm[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    /* An impossible clock time (25:99) is consumed but never stored —
       the task keeps its words and simply has no time (PACE-010). */
    time = (h <= 23 && mi <= 59) ? pad(h) + ":" + pad(mi) : null;
    s = s.replace(tm[0], " ");
  } else if (/\bnoon\b/i.test(s)) { time = "12:00"; s = s.replace(/\b(?:at\s+)?noon\b/i, " "); }
  else if (/\bin the morning\b/i.test(s)) { time = "09:00"; s = s.replace(/\bin the morning\b/i, " "); }
  else if (/\bin the afternoon\b/i.test(s)) { time = "14:00"; s = s.replace(/\bin the afternoon\b/i, " "); }
  else if (/\bin the evening\b/i.test(s)) { time = "19:00"; s = s.replace(/\bin the evening\b/i, " "); }

  var durationMin = null, um;
  if ((um = s.match(/\bfor (\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i))) {
    durationMin = /h/i.test(um[2]) ? Math.round(parseFloat(um[1]) * 60) : Math.round(parseFloat(um[1]));
    s = s.replace(um[0], " ");
  }
  var title = s.replace(/\s+/g, " ").trim().replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");
  /* A one-letter title is a real title ("X at 9am") — only wordless
     debris is refused, never a letter or a digit (PACE-015). */
  if (!/[a-z0-9]/i.test(title)) return null;
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (!durationMin) durationMin = estimateDuration(title);
  var cat = categoryFor(title);
  var essential = priority >= 3 || /\b(must|deadline|due|appointment|pick up|pickup|flight|doctor|dentist)\b/i.test(title);
  date = realDate(date);
  return {
    title: title, date: date, time: time, durationMin: durationMin,
    priority: priority, repeat: repeat, category: cat.id, color: cat.color,
    essential: essential, steps: decompose(title, durationMin, false)
  };
}

function parseDump(text, baseKey) {
  var out = [];
  var chunks = [];
  String(text || "").split(/\n+/).forEach(function (line) {
    line.split(/\s+and then\s+/i).forEach(function (part) {
      part.split(/;\s*/).forEach(function (p) { if (p.trim()) chunks.push(p); });
    });
  });
  /* A single long line with sentences becomes one task per sentence. */
  if (chunks.length === 1 && chunks[0].length > 90 && /\.\s+[A-Z]/.test(chunks[0])) {
    chunks = chunks[0].split(/\.\s+/).map(function (x) { return x.replace(/\.$/, ""); });
  }
  chunks.forEach(function (c) { var item = parseItem(c, baseKey); if (item) out.push(item); });
  return out;
}

function sortDay(tasks) {
  return tasks.slice().sort(function (a, b) {
    if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : (b.priority - a.priority);
    if (a.time) return -1;
    if (b.time) return 1;
    return (b.priority - a.priority) || (a.durationMin - b.durationMin);
  });
}

/* Build 37: the day adapts on its own. A task with no taught smaller version still gets a
   light (Bad day) and a medium (Ok day) version, found from the words in its title. */
var AUTO_VERBS = [
  [/\b(write|draft|compose|essay|article|report|blog|post|thesis|proposal)\b/i, "3 lines only", "half of it", 10],
  [/\b(read|study|revise|review|learn|course|chapter)\b/i, "1 page only", "10 minutes", 10],
  [/\b(clean|tidy|laundry|dishes|vacuum|declutter|organi[sz]e|sort|pack)\b/i, "5 min tidy", "one area", 5],
  [/\b(email|emails|reply|respond|message|inbox|text)\b/i, "one quick reply", "top 3 only", 5],
  [/\b(call|phone|ring)\b/i, "short call or text", "keep it brief", 5],
  [/\b(gym|workout|exercise|run|jog|walk|yoga|train|training|swim|stretch)\b/i, "5 min easy move", "short session", 10],
  [/\b(cook|meal|dinner|lunch|breakfast|prep)\b/i, "something simple", "quick version", 15],
  [/\b(pay|bill|bills|invoice|tax|taxes|budget|admin|paperwork|form)\b/i, "first line only", "the main part", 10],
  [/\b(plan|planning|schedule|roadmap|outline|brainstorm)\b/i, "list 3 things", "first part only", 10],
  [/\b(code|build|design|develop|fix|debug|ship)\b/i, "one small piece", "half the work", 10],
  [/\b(shop|shopping|buy|errand|errands|groceries)\b/i, "just the must-haves", "the short list", 15]
];
function roundFive(n) { return Math.max(5, Math.round(n / 5) * 5); }
function autoVersion(task, level) {
  var dur = task.durationMin || 15, title = task.title || "", row = null, i;
  for (i = 0; i < AUTO_VERBS.length; i++) if (AUTO_VERBS[i][0].test(title)) { row = AUTO_VERBS[i]; break; }
  if (level === "low") {
    if (dur <= 10) return null;
    var lm = row ? row[3] : 5;
    return { title: title + " (" + (row ? row[1] : "5 minutes only") + ")", durationMin: Math.min(dur, lm), kind: "light" };
  }
  if (level === "steady") {
    if (dur < 30) return null;
    return { title: title + " (" + (row ? row[2] : "short version") + ")", durationMin: roundFive(dur / 2), kind: "medium" };
  }
  return null;
}

/* The feeling adaptation. Returns the day as it should be SHOWN at a level.
   Nothing is deleted: parked tasks are simply resting out of sight. */
function adaptDay(tasks, level, tomorrowTasks) {
  var sorted = sortDay(tasks.filter(function (t) { return t.status !== "done"; }));
  var done = tasks.filter(function (t) { return t.status === "done"; });
  var visible = [], parked = [], stretch = null, i, t;
  if (level === "low") {
    var ess = sorted.filter(function (x) { return x.essential; });
    /* A task the user taught a smallest version for is part of their bare
       minimum by definition: it stays, shrunk, instead of vanishing. */
    var taught = sorted.filter(function (x) { return !x.essential && x.minVersion; });
    var rest = sorted.filter(function (x) { return !x.essential && !x.minVersion; });
    visible = ess.slice(0, 4).concat(taught.slice(0, 3)).slice(0, 6);
    if (!taught.length && visible.length < 4 && rest.length) {
      var tinies = rest.slice().sort(function (a, b) { return a.durationMin - b.durationMin; }).slice(0, 4 - visible.length);
      tinies.forEach(function (tn) { visible.push(tn); });
      rest = rest.filter(function (x) { return tinies.indexOf(x) === -1; });
    }
    parked = sorted.filter(function (x) { return visible.indexOf(x) === -1; });
  } else if (level === "full") {
    visible = sorted;
    if (tomorrowTasks && tomorrowTasks.length) {
      var tt = sortDay(tomorrowTasks.filter(function (x) { return x.status !== "done" && !x.essential; }));
      stretch = tt[0] || null;
    }
  } else { /* steady */
    visible = sorted.slice(0, 6);
    parked = sorted.slice(6);
  }
  visible = visible.map(function (x) {
    var copy = {}; for (var k in x) copy[k] = x[k];
    copy.displayTitle = x.title;
    copy.shrunk = false;
    if (level === "low" && x.minVersion) { copy.displayTitle = /^Just 5 minutes/.test(x.minVersion) ? "Just 5 minutes: " + x.title : x.minVersion; copy.shrunk = true; }
    if (!copy.shrunk && !x.minVersion && (level === "low" || level === "steady")) {
      var av = autoVersion(x, level);
      if (av) { copy.displayTitle = av.title; copy.durationMin = av.durationMin; copy.autoVersion = av.kind; copy.shrunk = av.kind === "light"; }
    }
    if (level === "full" && x.fullVersion) { copy.displayTitle = x.fullVersion; }
    return copy;
  });
  return { visible: visible, parked: parked, done: done, stretch: stretch };
}

/* Progress is scored against the ADAPTED plan, never the full list. */
function dayScore(adapted) {
  var total = adapted.visible.length + adapted.done.length;
  var doneCount = adapted.done.length;
  return { done: doneCount, total: total, pct: total ? Math.round((doneCount / total) * 100) : 100 };
}

function nextStepText(task) {
  if (task.steps && task.steps.length) {
    for (var i = 0; i < task.steps.length; i++) if (!task.steps[i].done) return task.steps[i].text;
  }
  return task.title;
}

function digestText(visible) {
  if (!visible.length) return tr("Nothing left showing today. The rest is parked, safe.");
  var quickest = visible.slice().sort(function (a, b) { return a.durationMin - b.durationMin; })[0];
  return tr(visible.length === 1 ? "{n} small thing left today. Quickest: {title} ({min} min)." : "{n} small things left today. Quickest: {title} ({min} min).", { n: visible.length, title: quickest.title, min: quickest.durationMin });
}

/* The habit icons a user can pick from (keys into the app's SVG sprite). */
var HABIT_ICONS = ["drop", "sun", "moon", "heart", "book", "coffee", "music", "star", "zap", "smile", "wind", "activity"];

/* Streak maths for Habits. days maps "YYYY-MM-DD" -> true. The current streak
   counts back from today, or from yesterday if today is not ticked yet (the
   day is not over, so the run is still alive). last7 is oldest first. */
function streakInfo(days, today) {
  days = days || {};
  var last7 = [];
  for (var i = 6; i >= 0; i--) { var k = addDays(today, -i); last7.push({ key: k, done: !!days[k] }); }
  var cur = 0;
  var k2 = days[today] ? today : addDays(today, -1);
  while (days[k2]) { cur++; k2 = addDays(k2, -1); }
  return { current: cur, last7: last7 };
}

var api = {
  pad: pad, toKey: toKey, parseKey: parseKey, addDays: addDays, todayKey: todayKey,
  toMin: toMin, toHHMM: toHHMM, nudgeTime: nudgeTime,
  categoryFor: categoryFor, CATEGORY_LIST: CATEGORY_LIST, estimateDuration: estimateDuration,
  isBig: isBig, decompose: decompose, parseItem: parseItem, parseDump: parseDump,
  sortDay: sortDay, adaptDay: adaptDay, dayScore: dayScore,
  nextStepText: nextStepText, digestText: digestText, CATEGORIES: CATEGORIES,
  HABIT_ICONS: HABIT_ICONS, streakInfo: streakInfo
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.CalmLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
