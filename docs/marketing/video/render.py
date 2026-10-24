"""Render launch.html to MP4 frame by frame, the shipvideo way (github.com/diggerhq/shipvideo).

A virtual clock replaces rAF, timers and Date, so each frame is drawn at an exact
timestamp; frames are piped to ffmpeg. Uses system Chrome via Playwright and Homebrew ffmpeg.

    python3 docs/marketing/video/render.py              # all three sizes
    python3 docs/marketing/video/render.py --check      # stills at a few timestamps, no video
"""
import argparse
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
FPS = 30
DURATION = 31
SIZES = {"1080x1920": (1080, 1920), "1920x1080": (1920, 1080), "1080x1080": (1080, 1080)}

CLOCK = """(() => {
  let now = 0, rafs = [], timers = [], seq = 0;
  const RealDate = Date, epoch = RealDate.now();
  performance.now = () => now;
  window.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(epoch + now); } static now() { return epoch + now; } };
  window.requestAnimationFrame = cb => { rafs.push(cb); return ++seq; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (cb, ms = 0) => { timers.push({ at: now + ms, cb }); return ++seq; };
  window.__seek = t => {
    while (now < t - 1e-6) {
      now = Math.min(t, now + 1000 / 60);
      const due = timers.filter(x => x.at <= now); timers = timers.filter(x => x.at > now); due.forEach(x => x.cb());
      const cbs = rafs; rafs = []; cbs.forEach(cb => cb(now));
    }
    if (rafs.length === 0) return now;
    const cbs = rafs; rafs = []; cbs.forEach(cb => cb(now));   // draw the exact frame time
    return now;
  };
})();"""


def open_page(browser, w, h):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
    ctx.add_init_script(CLOCK)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(f"{(HERE / 'launch.html').as_uri()}?w={w}&h={h}&dur={DURATION}", wait_until="load")
    page.evaluate("document.fonts.ready")
    page.evaluate("__seek(0)")
    return ctx, page, errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--only", choices=list(SIZES))
    args = ap.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--hide-scrollbars", "--force-color-profile=srgb"])
        for name, (w, h) in SIZES.items():
            if args.only and name != args.only:
                continue
            ctx, page, errors = open_page(browser, w, h)
            if args.check:
                for t in (2.5, 4.6, 7.5, 11.5, 16.5, 21.8, 25.5, 30):
                    page.evaluate(f"__seek({t * 1000})")
                    page.screenshot(path=str(HERE / f"check-{name}-{t}.png"))
            else:
                out = HERE / f"timeiq-launch-{name}.mp4"
                ff = subprocess.Popen(
                    ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
                     "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
                    stdin=subprocess.PIPE,
                )
                for i in range(DURATION * FPS):
                    page.evaluate(f"__seek({i * 1000 / FPS})")
                    ff.stdin.write(page.screenshot(type="jpeg", quality=92))
                ff.stdin.close()
                if ff.wait() != 0:
                    sys.exit(f"ffmpeg failed for {name}")
                print(out.name)
            if errors:
                print(name, "page errors:", errors[:5])
            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
