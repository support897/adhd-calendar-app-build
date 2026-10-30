// Copy the repository-root web app into the store's www/ bundle.
// This script is path-independent: the root app stays the single source
// of truth, and no live site is touched.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(SCRIPT_DIR, "..");
const SRC = path.resolve(STORE_ROOT, "..");
const DST = path.join(STORE_ROOT, "www");
const FILES = ["index.html", "styles.css", "app.js", "logic.js", "goals.js", "goals-ui.js", "fullcalendar.js", "i18n.js", "manifest.webmanifest", "service-worker.js", "icon.svg", "privacy.html", "support.html", "fonts/BricolageGrotesque.ttf", "fonts/Manrope.ttf", "calendar-import.js", "calendar-export.js", "audio-notes.js", "firebase-config.js", "firebase.js", "billing-config.js", "billing.js", "vendor/ical/ical.min.js"];
const VENDOR = path.join(SRC, "vendor", "tesseract");
function vendorFiles(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const rel = path.join(prefix, e.name);
    return e.isDirectory() ? vendorFiles(path.join(dir, e.name), rel) : [path.join("vendor", "tesseract", rel)];
  });
}
if (fs.existsSync(VENDOR)) FILES.push(...vendorFiles(VENDOR));
fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
let bad = 0;
for (const f of FILES) {
  const data = fs.readFileSync(path.join(SRC, f));
  fs.mkdirSync(path.dirname(path.join(DST, f)), { recursive: true });
  fs.writeFileSync(path.join(DST, f), data);
  const back = fs.readFileSync(path.join(DST, f));
  const same = crypto.createHash("md5").update(data).digest("hex") === crypto.createHash("md5").update(back).digest("hex");
  console.log((same ? "OK  " : "DIFF") + " " + f + " (" + data.length + " bytes)");
  if (!same) bad++;
}
console.log(bad ? "SYNC FAILED" : "SYNC OK: www/ is byte-identical to the web app");
process.exit(bad ? 1 : 0);
