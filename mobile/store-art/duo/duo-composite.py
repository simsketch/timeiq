#!/usr/bin/env python3
"""Frame the TimeIQ iPhone Duo captures in Apple's own bezels (Apple Design Resources, iPhone Duo,
Night Sky; licence in apple-bezels/). Adapted from kidcash/store-screenshots/tools/duo-composite.py.

Each capture in ../captures-duo/ is exactly its display's pixel size, so it drops into the bezel's
screen opening unscaled. Apple ships only flat poses, so the folds are built here: book (Inner Open
Landscape bent at its vertical fold) and laptop (Inner Open Portrait bent at its horizontal fold).
The inner display is one folding screen, so the halves join directly with a soft crease.

  python3 mobile/store-art/duo/duo-composite.py      -> duo/framed/*.png (transparent)
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(HERE, "..", "captures-duo", "{}.png")
OUT = os.path.join(HERE, "framed")
BZ = os.path.join(HERE, "apple-bezels", "iPhone Duo - Night Sky - {}.png")
# Top-left of each bezel's screen opening (2853x2007 / 2007x2853).
CUT = {"Inner Open Landscape": (120, 120), "Inner Open Portrait": (120, 120)}
SHADOW = (8, 6, 4, 255)  # graphite floor shadow


def compose_img(sc, pose):
    bz = Image.open(BZ.format(pose)).convert("RGBA")
    assert sc.size == (bz.size[0] - 240, bz.size[1] - 240), (pose, sc.size)  # captures must be display-exact
    canvas = Image.new("RGBA", bz.size, (0, 0, 0, 0))
    canvas.paste(sc, CUT[pose])
    out = Image.alpha_composite(canvas, bz)
    # Keep only the device silhouette: the bezel's outer transparent area stays transparent.
    out.putalpha(Image.fromarray(np.minimum(np.array(out.getchannel("A")), np.array(device_mask(bz)))))
    return out


def device_mask(bz):
    """Opaque bezel ring plus everything it encloses."""
    a = np.array(bz.getchannel("A")) > 10
    filled = np.zeros_like(a)
    for y in range(a.shape[0]):
        xs = np.flatnonzero(a[y])
        if xs.size:
            filled[y, xs[0]:xs[-1] + 1] = True
    return Image.fromarray((filled * 255).astype("uint8"))


def coeffs(dst, src):
    """Perspective coefficients mapping output points (dst) to input points (src)."""
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    return np.linalg.solve(np.array(m, float), np.array([c for p in src for c in p], float)).tolist()


def warp(img, size, dst):
    w, h = img.size
    return img.transform(size, Image.PERSPECTIVE, coeffs(dst, [(0, 0), (w, 0), (w, h), (0, h)]), Image.BICUBIC)


def crease(img, x0, x1, y, up, depth=46):
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(shade)
    for k in range(depth):
        yy = y - 1 - k if up else y + k
        d.line([(x0, yy), (x1, yy)], fill=(0, 0, 0, int(80 * (1 - k / depth) ** 2)))
    img.alpha_composite(shade)


def laptop(cap):
    """Folded about 100 degrees and held like a laptop: the top half leans back, the bottom lies flat."""
    flat = compose_img(Image.open(CAP.format(cap)).convert("RGBA"), "Inner Open Portrait")
    W, H = flat.size
    fold = 120 + 2853 // 2
    top, bot = flat.crop((0, 0, W, fold)).copy(), flat.crop((0, fold, W, H)).copy()
    crease(top, 120, W - 120, top.size[1], True)
    crease(bot, 120, W - 120, 0, False)
    lean, depth, spread = 0.025, 0.50, 0.075
    pad = int(W * spread) + 20
    CW = W + 2 * pad
    top_h, bot_h = int(top.size[1] * 0.985), int(bot.size[1] * depth)
    CH = top_h + bot_h + 140
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    sh = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(sh).ellipse((pad - 40, top_h + bot_h - 40, CW - pad + 40, top_h + bot_h + 110), fill=170)
    canvas.paste(Image.new("RGBA", (CW, CH), SHADOW), (0, 0), sh.filter(ImageFilter.GaussianBlur(45)))
    x0 = pad
    canvas.alpha_composite(warp(top, (CW, top_h), [(x0 + W * lean, 0), (x0 + W - W * lean, 0), (x0 + W, top_h), (x0, top_h)]), (0, 0))
    canvas.alpha_composite(warp(bot, (CW, bot_h), [(x0, 0), (x0 + W, 0), (x0 + W + W * spread, bot_h), (x0 - W * spread, bot_h)]), (0, top_h))
    hl = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).line([(x0 + 120, top_h - 1), (x0 + W - 120, top_h - 1)], fill=(255, 255, 255, 34), width=2)
    canvas.alpha_composite(hl)
    return canvas


def book(cap):
    """Held open like a book at about 130 degrees: one landscape capture bent at its vertical fold."""
    flat = compose_img(Image.open(CAP.format(cap)).convert("RGBA"), "Inner Open Landscape")
    W, H = flat.size
    fold = 120 + 1426
    lh, rh = flat.crop((0, 0, fold, H)).copy(), flat.crop((fold, 0, W, H)).copy()
    for img, right_side in ((lh, True), (rh, False)):
        shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(shade)
        for k in range(60):
            x = img.size[0] - 1 - k if right_side else k
            d.line([(x, 120), (x, H - 120)], fill=(0, 0, 0, int(90 * (1 - k / 60) ** 2)))
        img.alpha_composite(shade)
    fore, inset = 0.86, 0.045
    wl, wr = int(lh.size[0] * fore), int(rh.size[0] * fore)
    CW, CH = wl + wr, H + 160
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    sh = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(sh).ellipse((60, H - 30, CW - 60, H + 120), fill=160)
    canvas.paste(Image.new("RGBA", (CW, CH), SHADOW), (0, 0), sh.filter(ImageFilter.GaussianBlur(50)))
    i = H * inset
    canvas.alpha_composite(warp(lh, (CW, CH), [(0, 0), (wl, i), (wl, H - i), (0, H)]), (0, 0))
    canvas.alpha_composite(warp(rh, (CW, CH), [(wl, i), (CW, 0), (CW, H), (wl, H - i)]), (0, 0))
    hl = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).line([(wl, i + 120), (wl, H - i - 120)], fill=(255, 255, 255, 30), width=2)
    canvas.alpha_composite(hl)
    return canvas


def land(cap):
    return compose_img(Image.open(CAP.format(cap)).convert("RGBA"), "Inner Open Landscape")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    jobs = {f"land-{c}": (land, f"{c}-land") for c in ["01_agenda", "02_assistant", "03_availability", "04_calendars", "05_event_types", "06_import"]}
    jobs.update({"book-03_availability": (book, "03_availability-land"), "laptop-02_assistant": (laptop, "02_assistant-port")})
    for name, (fn, cap) in jobs.items():
        fn(cap).save(os.path.join(OUT, f"{name}.png"))
        print("framed", name)
