#!/usr/bin/env python3
"""Pace store preview recorder (v16-1 re-shoot, 2026-10-16, Avatar + Voice desk).
Serves ~/workspace/adhd-calendar-app on :8941, walks the preview script
(calendar -> Bad tap -> Talk to it -> Make my list -> Progress -> calendar)
capturing CDP screencast frames (Playwright record_video does not write
in this sandbox; the full chromium-1187 build is required, headless_shell
will not do). Assembly: concat-demuxer on frame timestamps, drop any
frames where the Plus sheet shows (it pops ~1s after the Talk panel
opens; dismiss() races it), lanczos upscale 443x960 -> 886x1920,
H.264 30 fps, silent, -bitexact, faststart, trim tail to length.
EXPORT SPEC (Store Uploads, 2026-10-16): 886x1920 native AND limited-range
 yuv420p (tv range) — full-range yuvj420p is REJECTED by App Store Connect
even at correct dimensions. Verify color_range=tv on every export."""
import base64, glob, json, os, time
from playwright.sync_api import sync_playwright
EXE = "/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome"
OUT = "/tmp/pace-frames"
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(f"{OUT}/*.png"): os.remove(f)
frames = []
def dismiss(pg):
    for sel in ("#welcomeSkip", "#guideSkip", "#plusNotNow", "#plusClose", "#guideClose"):
        try:
            loc = pg.locator(sel).first
            if loc.count() and loc.is_visible(): loc.click(timeout=1000); pg.wait_for_timeout(400)
        except Exception: pass
def side(pg, label):
    pg.evaluate("""(label) => { const b = [...document.querySelectorAll('.side-item')].find(e => e.innerText.includes(label)); if (b) b.click(); }""", label)
    pg.wait_for_timeout(900); dismiss(pg)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    ctx = b.new_context(viewport={"width":443,"height":960}, device_scale_factor=2)
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    def on_frame(ev):
        idx = len(frames)
        data = base64.b64decode(ev["data"])
        path = f"{OUT}/f{idx:04d}.png"
        open(path, "wb").write(data)
        frames.append({"path": path, "ts": ev["metadata"]["timestamp"]})
        cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
    cdp.on("Page.screencastFrame", on_frame)
    pg.goto("http://localhost:8941/index.html", wait_until="networkidle")
    pg.wait_for_timeout(1500); dismiss(pg)
    cdp.send("Page.startScreencast", {"format": "png", "maxWidth": 886, "maxHeight": 1920, "everyNthFrame": 1})
    t0 = time.time()
    pg.wait_for_timeout(4000)
    pg.get_by_role("button", name="Bad", exact=True).click()
    pg.wait_for_timeout(4200)
    side(pg, "Talk to it")
    pg.click("#dumpText", timeout=8000)
    pg.type("#dumpText", "Email Sam about Friday. Water the plants. Ring the school about the excursion.", delay=55)
    pg.wait_for_timeout(600)
    pg.click("#parseBtn"); pg.wait_for_timeout(3600)
    side(pg, "Progress"); pg.wait_for_timeout(3000)
    side(pg, "Calendar"); pg.wait_for_timeout(3400)
    cdp.send("Page.stopScreencast")
    total = time.time() - t0
    ctx.close(); b.close()
json.dump({"frames": frames, "total": total}, open(f"{OUT}/frames.json", "w"))
print("frames:", len(frames), "walk seconds:", round(total, 1))
