/* "Bring my calendar in" — the shared calendar import module.
   Design of record: IMPORT-DESIGN.md. Every app adopts this file
   unchanged; hosts change labels and tint only (IMPORT-ADOPTION.md).

   Parser: vendored ical.js 1.5.0 UMD (vendor/ical/, MPL-2.0) — the proven
   RFC 5545 engine (Mozilla). This file is the thin house layer:
   parse -> plan (pure, testable) -> apply (registry + counts).

   Fences (from the design): read-only against the source; imported
   data is the user's own (Law B); re-import dedupes, never doubles,
   never overwrites; repeats map live ONLY when the host's repeat
   model can say them truthfully — everything else expands. */
(function (root) {
  "use strict";
  var ICALRef = null;
  if (typeof ICAL !== "undefined") ICALRef = ICAL;
  else if (typeof require !== "undefined") { try { var m = require("./vendor/ical/ical.min.js"); ICALRef = (m && m.default) || m; } catch (e) { ICALRef = null; } }

  var DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var BYDAY_NUM = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function timeOf(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function validTime(value) {
    try { var date = value && value.toJSDate ? value.toJSDate() : null; return !!date && isFinite(date.getTime()); }
    catch (e) { return false; }
  }

  function localTimeZoneId() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
    catch (e) { return ""; }
  }

  function isLocalTimeZone(tzid) {
    if (!tzid || tzid === "floating") return true;
    try {
      var local = localTimeZoneId();
      if (!local) return false;
      return new Intl.DateTimeFormat("en-US", { timeZone: tzid }).resolvedOptions().timeZone ===
        new Intl.DateTimeFormat("en-US", { timeZone: local }).resolvedOptions().timeZone;
    } catch (e) { return false; }
  }

  function contentLineColon(line) {
    var quoted = false, escaped = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === "\\" && !escaped) { escaped = true; continue; }
      if (c === '"' && !escaped) quoted = !quoted;
      if (c === ":" && !quoted) return i;
      escaped = false;
    }
    return -1;
  }

  function cleanCalendarText(text) {
    var raw = String(text || "").split(/\r\n|\n|\r/), lines = [], malformed = 0, canFold = false;
    // RFC 5545 unfolding FIRST: a long line (an ATTENDEE with a long CN, say)
    // can be cut before its colon, so judge whole logical lines, never the pieces.
    raw.forEach(function (line) {
      if (!line) return;
      if (/^[ \t]/.test(line)) {
        if (lines.length) lines[lines.length - 1] += line.slice(1); else malformed++;
        return;
      }
      lines.push(line);
    });
    var kept = [];
    lines.forEach(function (line) {
      var colon = contentLineColon(line);
      if (colon <= 0) { malformed++; return; }
      var name = line.slice(0, colon).split(";")[0];
      if (!/^(?:[A-Za-z0-9-]+\.)?[A-Za-z0-9-]+$/.test(name)) { malformed++; return; }
      kept.push(line);
    });
    return { text: kept.join("\r\n"), malformedLines: malformed };
  }

  /* ---------- parse ---------- */
  function parseICS(text) {
    if (!ICALRef) return { calendarName: "", events: [], error: "parser missing", malformedLines: 0, skippedEvents: 0, cancelledEvents: 0 };
    var clean = cleanCalendarText(text), jcal;
    try {
      jcal = ICALRef.parse(clean.text);
      if (!jcal || !Array.isArray(jcal) || String(jcal[0]).toLowerCase() !== "vcalendar")
        return { calendarName: "", events: [], error: "not a calendar file", malformedLines: clean.malformedLines, skippedEvents: 0, cancelledEvents: 0 };
    } catch (e) {
      return { calendarName: "", events: [], error: "not a calendar file", malformedLines: clean.malformedLines, skippedEvents: 0, cancelledEvents: 0 };
    }
    var comp = new ICALRef.Component(jcal);
    // Register the file's own timezone definitions first (Apple/Outlook
    // exports lean on these; without them times land hours wrong).
    comp.getAllSubcomponents("vtimezone").forEach(function (vtz) {
      try {
        var tzid = vtz.getFirstPropertyValue("tzid");
        if (tzid) ICALRef.TimezoneService.register(tzid, new ICALRef.Timezone(vtz));
      } catch (e) { /* a broken vtimezone must not sink the import */ }
    });
    var calName = comp.getFirstPropertyValue("x-wr-calname") || comp.getFirstPropertyValue("name") || "";
    var events = [], skippedEvents = 0, cancelledEvents = 0, cancelledSlots = [];
    comp.getAllSubcomponents("vevent").forEach(function (ve) {
      try {
        var status = String(ve.getFirstPropertyValue("status") || "").toUpperCase();
        if (status === "CANCELLED") {
          cancelledEvents++;
          var cancelledUid = String(ve.getFirstPropertyValue("uid") || "").trim();
          var cancelledId = ve.getFirstPropertyValue("recurrence-id");
          if (cancelledUid && validTime(cancelledId)) {
            var cancelledDate = cancelledId.toJSDate();
            cancelledSlots.push({ uid: cancelledUid, slot: keyOf(cancelledDate) + "|" + (cancelledId.isDate ? "" : timeOf(cancelledDate)) });
          }
          return;
        }
        var ev = new ICALRef.Event(ve);
        if (!validTime(ev.startDate)) { skippedEvents++; return; }
        var end = ev.endDate || ev.startDate;
        if (!validTime(end) || end.toJSDate() < ev.startDate.toJSDate()) { skippedEvents++; return; }
        var title = (ev.summary || "").trim(), notes = (ev.description || "").trim(), location = (ev.location || "").trim();
        var rrule = null;
        var rr = ve.getFirstPropertyValue("rrule");
        if (rr) rrule = { freq: rr.freq || "", interval: rr.interval || 1, byday: (rr.parts && rr.parts.BYDAY) || [], until: !!rr.until, count: rr.count != null };
        var exdates = [];
        var rdates = [];
        ve.getAllProperties("rdate").forEach(function (prop) { prop.getValues().forEach(function (value) { rdates.push(value); }); });
        ve.getAllProperties("exdate").forEach(function (prop) {
          prop.getValues().forEach(function (value) {
            if (!validTime(value)) return;
            var date = value.toJSDate();
            exdates.push(keyOf(date) + "|" + (value.isDate ? "" : timeOf(date)));
          });
        });
        var recId = ve.getFirstPropertyValue("recurrence-id"), recDate = recId && recId.toJSDate ? recId.toJSDate() : null;
        if (recId && (!recDate || !isFinite(recDate.getTime()))) { skippedEvents++; return; }
        var recurrenceId = recId ? keyOf(recDate) : null;
        var recurrenceSlot = recId ? keyOf(recDate) + "|" + (recId.isDate ? "" : timeOf(recDate)) : null;
        var uid = String(ev.uid || "").trim();
        if (!uid) {
          var identity = [title, notes, location, ev.startDate.toString(), end.toString(), JSON.stringify(rrule || {}), recurrenceId || ""].join("\u001f");
          uid = "pace-" + hashStr(identity);
        }
        events.push({
          uid: uid, title: title, notes: notes, location: location,
          allDay: !!ev.startDate.isDate, start: ev.startDate, end: end,
          timeZoneId: ev.startDate.zone && ev.startDate.zone.tzid || "floating",
          rrule: rrule, exdates: exdates, rdates: rdates, hasRdate: rdates.length > 0,
          recurrenceId: recurrenceId, recurrenceSlot: recurrenceSlot,
          _ical: ev
        });
      } catch (e) { skippedEvents++; }
    });
    return { calendarName: calName, events: events, malformedLines: clean.malformedLines, skippedEvents: skippedEvents, cancelledEvents: cancelledEvents, cancelledSlots: cancelledSlots };
  }

  /* ---------- repeat mapping: truth or expand ---------- */
  function mapRepeat(ev) {
    var r = ev.rrule;
    if (!r || ev.exdates.length || ev.hasRdate || ev.recurrenceId) return null;
    // Pace stores a local day + clock time, not a timezone. A named-zone
    // series is only truthful as a live repeat when its zone is this device's
    // zone; otherwise expand it so DST and date crossings stay correct.
    if (!ev.allDay && !isLocalTimeZone(ev.timeZoneId)) return null;
    if (r.until || r.count) return null;               // bounded -> expand
    if ((r.interval || 1) !== 1) return null;          // fortnightly etc -> expand
    var startDay = ev.start.toJSDate().getDay();
    if (r.freq === "DAILY") return "every day";
    if (r.freq === "WEEKLY") {
      var days = (r.byday || []).map(function (d) { return BYDAY_NUM[String(d).replace(/^[+-]?\d+/, "")]; }).filter(function (n) { return n != null; });
      if (!days.length) return "every week";
      if (days.length === 1) return days[0] === startDay ? "every week" : "every " + DAY_NAMES[days[0]];
      var sorted = days.slice().sort().join(",");
      if (sorted === "1,2,3,4,5") return "every weekday";
      if (sorted === "0,6") return "every weekend";
      return null;
    }
    return null; // MONTHLY / YEARLY / anything richer -> expand
  }

  /* ---------- expansion ---------- */
  function expandEvent(ev, winStart, winEnd, out) {
    var push = function (startDate, endDate, title) {
      var s = startDate.toJSDate(), e = endDate ? endDate.toJSDate() : s;
      if (!isFinite(s.getTime()) || !isFinite(e.getTime())) return false;
      if (ev.allDay) {
        // DTEND for an all-day event is exclusive. Clip long events to the
        // import window so a multi-day event that began before it still lands.
        var d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
        var last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
        if (e > s) last.setDate(last.getDate() - 1);
        var firstAllowed = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate());
        var lastAllowed = new Date(winEnd.getFullYear(), winEnd.getMonth(), winEnd.getDate() - 1);
        if (last < firstAllowed || d > lastAllowed) return false;
        if (d < firstAllowed) d = firstAllowed;
        if (last > lastAllowed) last = lastAllowed;
        var guard = 0, added = 0;
        while (d <= last && guard++ < 400) { out.push({ title: title, date: keyOf(d), time: null, durationMin: 30, allDay: true }); added++; d.setDate(d.getDate() + 1); }
        return added > 0;
      }
      if (s < winStart || s >= winEnd) return false;
      var mins = Math.max(5, Math.round((e - s) / 60000));
      out.push({ title: title, date: keyOf(s), time: timeOf(s), durationMin: Math.min(isFinite(mins) ? mins : 5, 720), allDay: false });
      return true;
    };
    if (!ev.rrule && !ev.hasRdate) {
      var startDate = ev.start.toJSDate();
      var startSlot = keyOf(startDate) + "|" + (ev.start.isDate ? "" : timeOf(startDate));
      var skipSlots = ev._skipSlots || {};
      if (ev.exdates.indexOf(startSlot) === -1 && ev.exdates.indexOf(keyOf(startDate)) === -1 && !skipSlots[startSlot]) push(ev.start, ev.end, ev.title);
      return { truncated: false, error: false };
    }
    if (!ev.rrule && ev.hasRdate) {
      // ical.js' iterator returns only RDATE slots when there is no RRULE;
      // the master DTSTART still belongs in the imported set.
      var baseDate = ev.start.toJSDate();
      var baseSlot = keyOf(baseDate) + "|" + (ev.start.isDate ? "" : timeOf(baseDate));
      var skipSlots = ev._skipSlots || {};
      if (ev.exdates.indexOf(baseSlot) === -1 && ev.exdates.indexOf(keyOf(baseDate)) === -1 && !skipSlots[baseSlot]) push(ev.start, ev.end, ev.title);
      (ev.rdates || []).forEach(function (value) {
        var rStart = value && value.start ? value.start : value;
        if (!validTime(rStart)) return;
        var rDate = rStart.toJSDate(), rSlot = keyOf(rDate) + "|" + (rStart.isDate ? "" : timeOf(rDate));
        if (ev.exdates.indexOf(rSlot) !== -1 || ev.exdates.indexOf(keyOf(rDate)) !== -1 || skipSlots[rSlot]) return;
        var rEnd = value && value.end ? value.end : rStart.clone();
        if (!(value && value.end)) { try { if (ev._ical.duration) rEnd.addDuration(ev._ical.duration); } catch (e) { return; } }
        push(rStart, rEnd, ev.title);
      });
      return { truncated: false, error: false };
    }
    var it;
    try { it = ev._ical.iterator(); } catch (e) { return { truncated: true, error: true }; }
    var occ, guard = 0, finished = false, MAX_STEPS = 50000;
    var skip = {};
    ev.exdates.forEach(function (k) { skip[k] = true; });
    var skipSlots = ev._skipSlots || {};
    while (guard < MAX_STEPS) {
      try { occ = it.next(); } catch (e) { return { truncated: true, error: true }; }
      if (!occ) { finished = true; break; }
      guard++;
      var jsd = occ.toJSDate();
      if (!isFinite(jsd.getTime())) return { truncated: true, error: true };
      if (jsd >= winEnd) { finished = true; break; }
      var slot = keyOf(jsd) + "|" + (occ.isDate ? "" : timeOf(jsd));
      if (skip[slot] || skip[keyOf(jsd)] || skipSlots[slot]) continue;
      var endOcc = occ.clone();
      try { if (ev._ical.duration) endOcc.addDuration(ev._ical.duration); } catch (e) { return { truncated: true, error: true }; }
      push(occ, endOcc, ev.title);
    }
    return { truncated: !finished, error: false };
  }

  /* ---------- the plan (pure) ---------- */
  function importKeyFor(sourceLabel, events, calendarName) {
    // A calendar name stays the same when an export gains new events. For
    // nameless calendars, the first UID (then the source label) is a stable
    // fallback. Per-event dedupe below is independent of this registry key.
    var name = String(calendarName || "").trim().toLowerCase();
    var firstUid = (events || []).map(function (e) { return e && e.uid; }).filter(Boolean)[0] || "";
    var identity = name ? "calendar:" + name : firstUid ? "uid:" + firstUid : "source:" + String(sourceLabel || "calendar").trim().toLowerCase();
    return "imp-" + hashStr(identity);
  }

  function planImport(parsed, existingTasks, opts) {
    opts = opts || {};
    parsed = parsed || { events: [] };
    var now = opts.now ? new Date(opts.now) : new Date();
    var winStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    var winEnd = new Date(now.getFullYear(), now.getMonth() + 12, now.getDate() + 1); // exclusive: include the whole final day
    var importKey = opts.importKey || importKeyFor(opts.sourceLabel || "calendar", parsed.events || [], parsed.calendarName);
    var seen = {};
    (existingTasks || []).forEach(function (t) {
      if (t && t.importUid) seen[String(t.importUid) + "|" + t.date + "|" + (t.time || "")] = true;
    });
    // Group overrides by uid; a series with overrides expands as a whole,
    // and the master's occurrence at each overridden slot is skipped.
    var overridden = {};
    var overrideSlots = {};
    (parsed.events || []).forEach(function (e) {
      if (e.recurrenceId) {
        overridden[e.uid] = true;
        (overrideSlots[e.uid] = overrideSlots[e.uid] || {})[e.recurrenceSlot] = true;
      }
    });
    (parsed.cancelledSlots || []).forEach(function (item) {
      if (!item || !item.uid || !item.slot) return;
      overridden[item.uid] = true;
      (overrideSlots[item.uid] = overrideSlots[item.uid] || {})[item.slot] = true;
    });
    var plan = {
      importKey: importKey, add: [], liveRepeats: 0, expanded: 0, dupes: 0, skipped: [],
      outsideWindow: 0, malformedLines: Math.max(0, +parsed.malformedLines || 0),
      cancelled: Math.max(0, +parsed.cancelledEvents || 0)
    };
    for (var si = 0; si < Math.max(0, +parsed.skippedEvents || 0); si++) plan.skipped.push({ title: "(unreadable)", why: "an event without a usable date" });
    (parsed.events || []).forEach(function (ev) {
      if (!ev.title) { plan.skipped.push({ title: "(no title)", why: "an event with no name" }); return; }
      try {
        if (ev.recurrenceId) {
          // An override instance: it lands as its own single event.
          var singles = [];
          var overrideResult = expandEvent({ _ical: ev._ical, rrule: null, start: ev.start, end: ev.end, title: ev.title, allDay: ev.allDay, exdates: [] }, winStart, winEnd, singles);
          if (overrideResult.truncated) plan.skipped.push({ title: ev.title, why: "a recurring instance could not be read" });
          if (!singles.length && !overrideResult.truncated) plan.outsideWindow++;
          singles.forEach(function (shape) { addOne(plan, seen, ev, shape, importKey, null, true); });
          return;
        }
        var rep = (overridden[ev.uid] || opts.repeatModel === "none") ? null : mapRepeat(ev);
        if (rep) {
          var s0 = ev.start.toJSDate();
          var dur = Math.max(5, Math.round((ev.end.toJSDate() - s0) / 60000));
          var added = addOne(plan, seen, ev, { title: ev.title, date: keyOf(s0), time: ev.allDay ? null : timeOf(s0), durationMin: ev.allDay ? 30 : Math.min(isFinite(dur) ? dur : 5, 720), allDay: ev.allDay }, importKey, rep, false);
          if (!added) return;
          return;
        }
        var instances = [];
        ev._skipSlots = overrideSlots[ev.uid] || {};
        var expansion = expandEvent(ev, winStart, winEnd, instances);
        if (expansion.truncated) plan.skipped.push({ title: ev.title, why: expansion.error ? "a repeat could not be expanded" : "a repeat exceeded the safe import limit" });
        if (!instances.length) { if (!expansion.truncated) plan.outsideWindow++; return; }
        instances.forEach(function (shape) { addOne(plan, seen, ev, shape, importKey, null, !!(ev.rrule || ev.hasRdate)); });
      } catch (e) { plan.skipped.push({ title: ev.title, why: "the event could not be read" }); }
    });
    return plan;
  }

  function addOne(plan, seen, ev, s, importKey, repeat, expanded) {
    var key = String(ev.uid || "") + "|" + s.date + "|" + (s.time || "");
    if (seen[key]) { plan.dupes++; return false; }
    seen[key] = true;
    plan.add.push({
      title: s.title, date: s.date, time: s.time, durationMin: s.durationMin,
      repeat: repeat || null, allDay: !!s.allDay, notes: ev.notes || "", location: ev.location || "",
      importUid: ev.uid, importKey: importKey, _live: !!repeat
    });
    if (repeat) plan.liveRepeats++;
    if (expanded) plan.expanded++;
    return true;
  }

  /* ---------- apply (host commits through its own save) ---------- */
  function applyImport(state, plan, sourceLabel, toTask) {
    var added = 0;
    plan.add.forEach(function (shape) {
      state.tasks.push(toTask(shape));
      added++;
    });
    // One stable registry row per calendar; empty re-imports write nothing.
    if (added > 0) {
      state.imports = Array.isArray(state.imports) ? state.imports : [];
      var row = state.imports.filter(function (r) { return r && r.key === plan.importKey; })[0];
      if (row) {
        row.count = Math.max(0, Math.round(+row.count) || 0) + added;
        row.at = new Date().toISOString();
        row.source = sourceLabel || row.source || "calendar";
      } else state.imports.push({ key: plan.importKey, source: sourceLabel || "calendar", at: new Date().toISOString(), count: added });
    }
    return {
      added: added, liveRepeats: plan.liveRepeats, expanded: plan.expanded,
      dupes: plan.dupes, skipped: plan.skipped.length, outsideWindow: plan.outsideWindow || 0,
      malformedLines: plan.malformedLines || 0, cancelled: plan.cancelled || 0
    };
  }

  var CI = { parseICS: parseICS, planImport: planImport, applyImport: applyImport, importKeyFor: importKeyFor, mapRepeat: mapRepeat, _keyOf: keyOf };
  if (typeof module !== "undefined" && module.exports) module.exports = CI;
  root.CI = CI;
})(typeof window !== "undefined" ? window : globalThis);
