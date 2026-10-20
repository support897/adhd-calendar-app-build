/* Pace service worker. Caches the app so it opens fast and works offline. */
const CACHE = "pace-v16-20";
const FILES = ["./", "index.html", "styles.css", "fullcalendar.js", "i18n.js", "logic.js", "app.js", "calendar-import.js", "firebase-config.js", "billing-config.js", "billing.js", "firebase.js", "vendor/ical/ical.min.js", "manifest.webmanifest", "icon.svg", "fonts/BricolageGrotesque.ttf", "fonts/Manrope.ttf", "privacy.html", "support.html", "vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js", "vendor/tesseract/core/tesseract-core-lstm.wasm.js", "vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js", "vendor/tesseract/lang/eng.traineddata.gz"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) { e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); })); });
/* A tap on a reminder routes to its task (HQ ruling): focus the
   app with the payload, or open it carrying the payload in the
   address — never a bare home open. */
self.addEventListener("notificationclick", function (e) {
  var d = (e.notification && e.notification.data) || {};
  var tap = { task: d.task || "", date: d.date || "" };
  try { e.notification.close(); } catch (err) {}
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ("focus" in c) { try { c.postMessage({ paceTap: tap }); } catch (err) {} return c.focus(); }
    }
    if (clients.openWindow) return clients.openWindow("./?paceTask=" + encodeURIComponent(tap.task) + "&paceDay=" + encodeURIComponent(tap.date));
  }));
});
