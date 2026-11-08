#!/usr/bin/env python3
"""Builds the TimeIQ logo files from one geometry (mark 86: a ring with a notch, and a full stop).
   python3 brand/build.py   -> brand/logo/*.svg, brand/png/*.png, frontend + mobile icon files
Every shape is a plain path (no masks, no fonts), so the SVGs work anywhere."""
import math, os, subprocess, tempfile
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
GRAPHITE, CREAM, TANGERINE = "#141414", "#F4EFE3", "#F2690D"

# ---- the mark, in a 100-unit box ----
CX = CY = 46.0; R = 27.0; W = 9.0; A = 45.0
RO, RI = R + W / 2, R - W / 2
DOT_R = 6.2; DOT_D = RO + 7 + DOT_R - 2           # full stop: just past the notch
SHIFT = (100 - (CX - RO) - (CX + DOT_D * math.cos(math.radians(A)) + DOT_R)) / 2  # centre the mark's bounds

def pol(r, a): return (CX + r * math.cos(math.radians(a)), CY + r * math.sin(math.radians(a)))
apex = pol(RO + 0.5, A); b1 = pol(RI - 3, A - 15); b2 = pol(RI - 3, A + 15)

def hit(p, q, r):
    """first point where segment p->q crosses the circle of radius r (from p)"""
    dx, dy = q[0] - p[0], q[1] - p[1]; fx, fy = p[0] - CX, p[1] - CY
    a = dx * dx + dy * dy; b = 2 * (fx * dx + fy * dy); c = fx * fx + fy * fy - r * r
    t = (-b - math.sqrt(b * b - 4 * a * c)) / (2 * a)
    if t < 0: t = (-b + math.sqrt(b * b - 4 * a * c)) / (2 * a)
    return (p[0] + t * dx, p[1] + t * dy)

o1, o2 = hit(apex, b1, RO), hit(apex, b2, RO)    # outer edge, each side of the notch
i1, i2 = hit(apex, b1, RI), hit(apex, b2, RI)    # inner edge
f = lambda p: f"{p[0] + SHIFT:.3f} {p[1] + SHIFT:.3f}"
RING = (f"M{f(o2)} A{RO} {RO} 0 1 1 {f(o1)} L{f(i1)} A{RI} {RI} 0 1 0 {f(i2)} Z")
dc = pol(DOT_D, A); DOT = (dc[0] + SHIFT, dc[1] + SHIFT)

def mark(ring, dot, s=1.0, x=0.0, y=0.0):
    t = f' transform="translate({x:.3f} {y:.3f}) scale({s:.4f})"' if (s != 1 or x or y) else ""
    return f'<g{t}><path d="{RING}" fill="{ring}"/><circle cx="{DOT[0]:.3f}" cy="{DOT[1]:.3f}" r="{DOT_R}" fill="{dot}"/></g>'

def svg(w, h, body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>\n'

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True); open(path, "w").write(text)

# ---- wordmark: "timei" in Geist Bold as outlines, the mark as its Q ----
FONT = os.path.join(ROOT, "frontend/node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf")
font = TTFont(FONT); gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
cap = font["OS/2"].sCapHeight
def word(text, size, tracking=-0.035):
    """returns (svg path d, advance width) for text at `size` px tall em, baseline at y=0"""
    sc = size / upm; x = 0.0; ds = []
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, x, 0)))
        ds.append(pen.getCommands())
        x += gs[g].width * sc + (tracking * size if i < len(text) - 1 else 0)
    return " ".join(ds), x

def lockup(ink, ring, dot, h=120, pad=0):
    size = h                                   # em size
    d, adv = word("timei", size)
    capH = cap / upm * size
    ring_d = 2 * RO                           # ring outer diameter in mark units
    s = capH / ring_d * 1.04                  # ring as tall as a capital, a touch over for optics
    gap = size * 0.02
    mx = adv + gap - (CX - RO + SHIFT) * s     # left edge of the ring right after the i
    base = h * 0.95                            # baseline
    my = base - (CY + RO + SHIFT) * s          # ring sits on the baseline
    right = mx + (DOT[0] + DOT_R) * s
    bottom = my + (DOT[1] + DOT_R) * s
    W_, H_ = math.ceil(right + pad * 2), math.ceil(max(bottom, base) + pad + h * 0.06)
    body = f'<g transform="translate({pad} {pad})"><path d="{d}" fill="{ink}" transform="translate(0 {base})"/>{mark(ring, dot, s, mx, my)}</g>'
    return svg(W_ + pad, H_ + pad, body)

L = os.path.join(HERE, "logo")
write(f"{L}/timeiq-mark-on-dark.svg", svg(100, 100, mark(CREAM, TANGERINE)))
write(f"{L}/timeiq-mark-on-light.svg", svg(100, 100, mark(GRAPHITE, TANGERINE)))
write(f"{L}/timeiq-mark-tangerine.svg", svg(100, 100, mark(TANGERINE, GRAPHITE)))
write(f"{L}/timeiq-mark-mono-black.svg", svg(100, 100, mark(GRAPHITE, GRAPHITE)))
write(f"{L}/timeiq-mark-mono-white.svg", svg(100, 100, mark("#FFFFFF", "#FFFFFF")))
icon = lambda bg, ring, dot, inset=0.16: svg(100, 100, f'<rect width="100" height="100" fill="{bg}"/>' + mark(ring, dot, 1 - 2 * inset, 100 * inset, 100 * inset))
write(f"{L}/timeiq-app-icon.svg", icon(GRAPHITE, CREAM, TANGERINE))
write(f"{L}/timeiq-app-icon-light.svg", icon(CREAM, GRAPHITE, TANGERINE))
write(f"{L}/timeiq-app-icon-tangerine.svg", icon(TANGERINE, CREAM, GRAPHITE))
# favicon: rounded tile, mark larger so it survives 16px
fav = svg(100, 100, f'<rect width="100" height="100" rx="24" fill="{GRAPHITE}"/>' + mark(CREAM, TANGERINE, 0.8, 10, 10))
write(f"{L}/timeiq-favicon.svg", fav)
write(f"{L}/timeiq-wordmark-on-light.svg", lockup(GRAPHITE, GRAPHITE, TANGERINE))
write(f"{L}/timeiq-wordmark-on-dark.svg", lockup(CREAM, CREAM, TANGERINE))

# ---- PNGs, rendered by headless Chrome so they match the browser exactly ----
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
def png(src_svg, out, w, h=None, bg="transparent"):
    h = h or w
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as t:
        t.write(f'<html><body style="margin:0;background:{bg}"><img src="file://{src_svg}" style="width:{w}px;height:{h}px;display:block"></body></html>')
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
                    f"--window-size={w},{h}", f"--screenshot={out}", f"file://{t.name}"], capture_output=True)
    os.unlink(t.name)

P = os.path.join(HERE, "png")
png(f"{L}/timeiq-app-icon.svg", f"{P}/app-icon-1024.png", 1024)
png(f"{L}/timeiq-app-icon.svg", f"{P}/apple-touch-icon-180.png", 180)
png(f"{L}/timeiq-favicon.svg", f"{P}/favicon-32.png", 32)
png(f"{L}/timeiq-favicon.svg", f"{P}/favicon-192.png", 192)
png(f"{L}/timeiq-favicon.svg", f"{P}/favicon-512.png", 512)
png(f"{L}/timeiq-mark-on-dark.svg", f"{P}/mark-on-dark-1024.png", 1024)
png(f"{L}/timeiq-mark-on-light.svg", f"{P}/mark-on-light-1024.png", 1024)
import re
for name in ["on-light", "on-dark"]:
    s = open(f"{L}/timeiq-wordmark-{name}.svg").read(); w_, h_ = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', s).groups())
    png(f"{L}/timeiq-wordmark-{name}.svg", f"{P}/wordmark-{name}-{w_*4}w.png", w_ * 4, h_ * 4)

# ---- the site and the app ----
FE = os.path.join(ROOT, "frontend/public")
write(f"{FE}/favicon.svg", fav)
subprocess.run(["cp", f"{P}/apple-touch-icon-180.png", f"{FE}/apple-touch-icon.png"])
subprocess.run(["cp", f"{P}/favicon-192.png", f"{FE}/icon-192.png"])
subprocess.run(["cp", f"{P}/favicon-512.png", f"{FE}/icon-512.png"])
MB = os.path.join(ROOT, "mobile/assets")
png(f"{L}/timeiq-app-icon.svg", f"{MB}/icon.png", 1024)
# Android adaptive foreground: the mark inside the 66% safe zone on transparency (background colour set in app.json)
write(f"{HERE}/tmp-adaptive.svg", svg(100, 100, mark(CREAM, TANGERINE, 0.5, 25, 25)))
png(f"{HERE}/tmp-adaptive.svg", f"{MB}/adaptive-icon.png", 1024)
png(f"{L}/timeiq-mark-on-dark.svg", f"{MB}/splash-icon.png", 1024)
png(f"{L}/timeiq-favicon.svg", f"{MB}/favicon.png", 48)
os.unlink(f"{HERE}/tmp-adaptive.svg")
print("RING", RING); print("DOT", DOT, DOT_R)
