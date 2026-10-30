/* Pace Calendar export layer.
   Tasks store a calendar date and local wall-clock time, not a source TZID.
   Timed VEVENT values are therefore floating local times, with the device's
   IANA zone included as X-WR-TIMEZONE. This keeps local recurrences at the
   same clock time across DST; it does not invent a source zone that Pace no
   longer has. */
(function (root) {
  "use strict";
  var ICALRef = root.ICAL || null;
  if (!ICALRef && typeof require !== "undefined") {
    try { var loaded = require("./vendor/ical/ical.min.js"); ICALRef = (loaded && loaded.default) || loaded; } catch (e) {}
  }
  var DAY_NAMES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  function dateParts(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], value = new Date(0);
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCFullYear(y, mo - 1, d);
    if (value.getUTCFullYear() !== y || value.getUTCMonth() !== mo - 1 || value.getUTCDate() !== d) return null;
    return { year: y, month: mo, day: d, weekday: value.getUTCDay() };
  }
  function dateKey(date) {
    return String(date.getUTCFullYear()).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
  }
  function addDays(key, amount) {
    var p = dateParts(key); if (!p) return null;
    var date = new Date(0); date.setUTCHours(0, 0, 0, 0); date.setUTCFullYear(p.year, p.month - 1, p.day + amount);
    return dateKey(date);
  }
  function clockParts(value) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return { hour: +m[1], minute: +m[2], text: String(m[1]).padStart(2, "0") + ":" + m[2] };
  }
  function repeatRule(repeat, key) {
    var value = String(repeat || "").toLowerCase();
    var p = dateParts(key);
    if (value === "every day") return "FREQ=DAILY";
    if (value === "every weekday") return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    if (value === "every weekend") return "FREQ=WEEKLY;BYDAY=SA,SU";
    if (value === "every week") return p ? "FREQ=WEEKLY;BYDAY=" + DAY_NAMES[p.weekday] : null;
    var m = /^every (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(value);
    if (m) {
      var names = { sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH", friday: "FR", saturday: "SA" };
      return "FREQ=WEEKLY;BYDAY=" + names[m[1]];
    }
    return null;
  }
  function toDateTime(ICAL, key, clock) {
    return ICAL.Time.fromDateTimeString(key + "T" + clock + ":00");
  }
  function localEnd(key, clock, minutes) {
    var p = dateParts(key), c = clockParts(clock); if (!p || !c) return null;
    var end = new Date(0); end.setUTCHours(0, 0, 0, 0); end.setUTCFullYear(p.year, p.month - 1, p.day);
    end.setUTCHours(c.hour, c.minute + minutes, 0, 0);
    return { date: dateKey(end), time: String(end.getUTCHours()).padStart(2, "0") + ":" + String(end.getUTCMinutes()).padStart(2, "0") };
  }
  function localZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
    catch (e) { return ""; }
  }
  function toICS(state, options) {
    options = options || {};
    if (!ICALRef) throw new Error("The iCalendar library is not available.");
    var calendar = new ICALRef.Component(["vcalendar", [], []]);
    calendar.updatePropertyWithValue("prodid", "-//Pace Calendar//Pace Calendar//EN");
    calendar.updatePropertyWithValue("version", "2.0");
    calendar.updatePropertyWithValue("calscale", "GREGORIAN");
    calendar.updatePropertyWithValue("x-wr-calname", "Pace Calendar");
    var zone = options.timeZone || localZone();
    if (zone) calendar.updatePropertyWithValue("x-wr-timezone", zone);
    var now = options.now ? new Date(options.now) : new Date();
    if (!isFinite(now.getTime())) now = new Date();
    var dtstamp = ICALRef.Time.fromJSDate(now, true);
    var tasks = state && Array.isArray(state.tasks) ? state.tasks : [];

    tasks.forEach(function (task, index) {
      if (!task || typeof task.title !== "string" || !task.title.trim()) return;
      var parts = dateParts(task.date); if (!parts) return;
      var allDay = !!task.allDay || !task.time;
      var eventComponent = new ICALRef.Component("vevent");
      var event = new ICALRef.Event(eventComponent);
      event.uid = String(task.id || "task-" + index) + "@pace-calendar";
      event.summary = task.title.trim();
      if (task.originalText || task.notes) event.description = String(task.originalText || task.notes);
      eventComponent.updatePropertyWithValue("dtstamp", dtstamp);
      if (allDay) {
        event.startDate = ICALRef.Time.fromDateString(task.date);
        event.endDate = ICALRef.Time.fromDateString(addDays(task.date, 1));
      } else {
        var clock = clockParts(task.time); if (!clock) return;
        var duration = Math.max(5, Math.round(+task.durationMin || 25));
        var end = localEnd(task.date, clock.text, duration); if (!end) return;
        event.startDate = toDateTime(ICALRef, task.date, clock.text);
        event.endDate = toDateTime(ICALRef, end.date, end.time);
        if (zone) {
          // Timed events carry the wall-clock time AND its zone (TZID), so
          // another calendar app in a different zone shows the same instant.
          ["dtstart", "dtend"].forEach(function (name) {
            var prop = eventComponent.getFirstProperty(name);
            if (prop) prop.setParameter("tzid", zone);
          });
        }
      }
      var rule = repeatRule(task.repeat, task.date);
      if (rule) eventComponent.addProperty(ICALRef.Property.fromString("RRULE:" + rule));
      if (task.repeat && !rule) eventComponent.addPropertyWithValue("X-PACE-REPEAT", String(task.repeat));
      var skips = Array.isArray(task.skipDates) ? task.skipDates.filter(function (key) { return !!dateParts(key); }) : [];
      if (skips.length) {
        var exdate = new ICALRef.Property("exdate");
        if (!allDay && zone) exdate.setParameter("tzid", zone);
        exdate.setValues(skips.map(function (key) {
          return allDay ? ICALRef.Time.fromDateString(key) : toDateTime(ICALRef, key, clock.text);
        }));
        eventComponent.addProperty(exdate);
      }
      calendar.addSubcomponent(eventComponent);
    });
    return calendar.toString();
  }

  var API = { toICS: toICS, repeatRule: repeatRule };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.PaceCalendarExport = API;
})(typeof window !== "undefined" ? window : globalThis);
