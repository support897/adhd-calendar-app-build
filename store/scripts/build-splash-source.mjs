// Splash source images for @capacitor/assets: the Pace mark centred on white, 2732x2732.
import { chromium } from "/home/hatch/node_modules/playwright-core/index.mjs";
import fs from "fs";
const svg = fs.readFileSync("/home/hatch/workspace/pace-store/www/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: "/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const name of ["splash.png", "splash-dark.png"]) {
  const page = await browser.newPage({ viewport: { width: 2732, height: 2732 } });
  await page.setContent(`<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:100vh">${svg.replace("<svg ", `<svg width="820" height="820" `)}</body>`);
  await page.screenshot({ path: "/home/hatch/workspace/pace-store/assets/" + name });
  await page.close();
  console.log("wrote assets/" + name);
}
await browser.close();
