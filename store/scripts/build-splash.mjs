// Replace the Capacitor template splash screens with the Pace mark on white.
import { chromium } from "/home/hatch/node_modules/playwright-core/index.mjs";
import fs from "fs"; import path from "path";
const RES = "/home/hatch/workspace/pace-store/android/app/src/main/res";
const svg = fs.readFileSync("/home/hatch/workspace/pace-store/www/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: "/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const dir of fs.readdirSync(RES).filter(d => d.startsWith("drawable-"))) {
  const f = path.join(RES, dir, "splash.png");
  if (!fs.existsSync(f)) continue;
  const b = fs.readFileSync(f);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const mark = Math.round(Math.min(w, h) * 0.38);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:100vh">${svg.replace("<svg ", `<svg width="${mark}" height="${mark}" `)}</body>`);
  await page.screenshot({ path: f });
  await page.close();
  console.log("splash", dir, w + "x" + h);
}
await browser.close();
console.log("SPLASH DONE");
