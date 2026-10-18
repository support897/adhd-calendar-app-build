// Build the store listing assets for Pace: icons at store sizes, the Play
// feature graphic, and phone screenshots at Play (1080x1920) and Apple
// 6.7" (1290x2796) sizes. Renders the real app and the real brand mark.
import { chromium } from "/home/hatch/node_modules/playwright-core/index.mjs";
import http from "http"; import fs from "fs"; import path from "path";
const ROOT = "/home/hatch/workspace/pace-store";
const WWW = path.join(ROOT, "www");
const OUT = path.join(ROOT, "listing");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".gz": "application/gzip" };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html"; const f = path.join(WWW, p); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(8921, r));
const browser = await chromium.launch({ executablePath: "/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome", args: ["--no-sandbox"] });
const svg = fs.readFileSync(path.join(WWW, "icon.svg"), "utf8");
async function renderIcon(size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:#fff">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: file });
  await page.close();
  console.log("icon", size, file);
}
fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });
await renderIcon(512, path.join(OUT, "icons/play-icon-512.png"));
await renderIcon(1024, path.join(OUT, "icons/appstore-icon-1024.png"));
/* Android launcher densities (legacy + adaptive foreground). */
const dens = { "mipmap-mdpi": [48, 108], "mipmap-hdpi": [72, 162], "mipmap-xhdpi": [96, 216], "mipmap-xxhdpi": [144, 324], "mipmap-xxxhdpi": [192, 432] };
for (const [folder, [legacy, fg]] of Object.entries(dens)) {
  const dir = path.join(ROOT, "android/app/src/main/res", folder);
  if (!fs.existsSync(dir)) { console.log("skip (missing)", dir); continue; }
  await renderIcon(legacy, path.join(dir, "ic_launcher.png"));
  await renderIcon(legacy, path.join(dir, "ic_launcher_round.png"));
  await renderIcon(fg, path.join(dir, "ic_launcher_foreground.png"));
}
/* iOS app icon: replace the template's 1024 in place, keep its filename. */
const iosIcons = path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
if (fs.existsSync(iosIcons)) {
  const pngs = fs.readdirSync(iosIcons).filter(f => f.endsWith(".png"));
  for (const p of pngs) await renderIcon(1024, path.join(iosIcons, p));
  console.log("ios icons replaced:", pngs.join(", "));
}
/* Feature graphic 1024x500. */
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(`<body style="margin:0;background:#f7f5f0;font-family:Helvetica,Arial,sans-serif">
    <div style="display:flex;align-items:center;gap:44px;padding:90px 80px">
      <div style="flex:none">${svg.replace("<svg ", `<svg width="300" height="300" `)}</div>
      <div>
        <div style="font-size:110px;font-weight:700;color:#1c1c1e;letter-spacing:-2px">Pace</div>
        <div style="font-size:42px;color:#5a5a5e;margin-top:6px">Your day, at your pace.</div>
        <div style="margin-top:34px">
          <span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#d9a441;margin-right:14px"></span>
          <span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#3fa46a;margin-right:14px"></span>
          <span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#2f7cf6"></span>
        </div>
      </div>
    </div></body>`);
  await page.screenshot({ path: path.join(OUT, "feature-graphic-1024x500.png") });
  await page.close();
  console.log("feature graphic done");
}
/* Screenshots of the real current app, including To Do and Habits. */
async function dismissGuide(page) {
  if (await page.locator("#guideSheet").isVisible().catch(() => false)) {
    await page.click("#guideSkip");
    await page.waitForFunction(() => document.getElementById("guideSheet").hidden);
  }
}
async function nav(page, panel) {
  if (await page.evaluate(() => document.getElementById("sidebar").getBoundingClientRect().width === 0)) {
    await dismissGuide(page);
    await page.click("#sbExpand");
    await page.waitForFunction(() => document.getElementById("sidebar").getBoundingClientRect().width > 0);
  }
  await page.click('.side-item[data-panel="' + panel + '"]');
  await page.locator("#panel-" + panel).waitFor({ state: "visible" });
}
async function shots(dir, w, h) {
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8921/", { waitUntil: "networkidle" });
  await page.click("#welcomeDone").catch(async () => { await page.click("#welcomeSkip"); });
  await dismissGuide(page);
  await page.locator("#calendarWrap").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(dir, "01-month.png") });
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("calmcal-v1")); const t = new Date(); const k = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); s.feelings[k] = "low"; localStorage.setItem("calmcal-v1", JSON.stringify(s)); });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#calendarWrap").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(dir, "02-low-day.png") });
  await nav(page, "capture");
  await page.fill("#dumpText", "Ring the dentist to rebook\nBuy oat milk and eggs\nWrite the first draft of the email to Sam");
  await page.click("#parseBtn");
  await page.locator(".draft-card").first().waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(dir, "03-talk-to-it.png") });
  await nav(page, "todo");
  for (const item of ["Ring the dentist", "Buy oat milk", "Post the forms"]) {
    await page.fill("#todoInput", item);
    await page.click("#todoAddBtn");
    await page.getByText(item, { exact: true }).waitFor({ state: "visible" });
  }
  await page.screenshot({ path: path.join(dir, "04-to-do.png") });
  await nav(page, "habits");
  await page.click('button[aria-label="Icon: sun"]');
  await page.fill("#habitName", "Morning stretch");
  await page.click("#habitAddBtn");
  await page.getByText("Morning stretch", { exact: true }).waitFor({ state: "visible" });
  await page.click('button[aria-label="Icon: book"]');
  await page.fill("#habitName", "Read for 10 minutes");
  await page.click("#habitAddBtn");
  await page.getByText("Read for 10 minutes", { exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(dir, "05-habits.png") });
  await nav(page, "settings");
  await page.screenshot({ path: path.join(dir, "06-make-it-yours.png") });
  await ctx.close();
  console.log("shots done", dir);
}
await shots(path.join(OUT, "screenshots/play"), 360, 640);
await shots(path.join(OUT, "screenshots/apple"), 430, 932);
await browser.close(); server.close();
console.log("ASSETS DONE");
