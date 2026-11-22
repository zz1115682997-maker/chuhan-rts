# -*- coding: utf-8 -*-
"""建筑立绘对齐：按 footprint 决定屏幕尺寸，底边中心对齐地面菱形下顶点。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT = r"C:\Windows\Fonts\msyh.ttc"
TILE_W, TILE_H = 64, 32
GAP = 3          # 内容底边离画布底的距离

# kind, 中文名, 源文件, w, h（占地格数）
JOBS = [
    ("nutai", "弩台", "nutai_raw.png", 2, 2),
    ("bingying", "兵营", "bingying_raw.png", 2, 2),
    ("canglin", "仓廪", "canglin_raw.png", 3, 2),
    ("chemafang", "车马坊", "chemafang_raw.png", 3, 2),
    ("daying", "大营", "daying_raw.png", 3, 3),
]


def f(s):
    try:
        return ImageFont.truetype(FONT, s)
    except Exception:
        return ImageFont.load_default()


def cutout(im, t=70):
    im = im.convert("RGBA")
    a = np.array(im).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if al.min() < 5:
        return im
    d = np.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2)
    a[..., 3] = np.clip((d - t) / 40.0 * 255.0, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def crop(im, t=40):
    al = np.array(im)[..., 3]
    rows = np.where((al > t).any(axis=1))[0]
    cols = np.where((al > t).any(axis=0))[0]
    solid = np.where((al > 100).any(axis=1))[0]
    return im.crop((cols.min(), rows.min(), cols.max() + 1, max(solid.max() + 1, rows.min() + 1)))


def make(kind, raw, w, h):
    im = crop(cutout(Image.open(os.path.join(UNITS, raw))))
    target_w = (w + h) * (TILE_W // 2)      # 菱形全宽 = (w+h)*32
    k = target_w * 0.97 / im.width
    iw, ih = round(im.width * k), round(im.height * k)
    body = im.resize((iw, ih), Image.LANCZOS)
    H = ih + GAP + 2
    c = Image.new("RGBA", (target_w, H), (0, 0, 0, 0))
    c.alpha_composite(body, ((target_w - iw) // 2, H - GAP - ih))
    c.save(os.path.join(UNITS, f"{kind}_art.png"))
    print(kind, im.size, "->", (target_w, H))
    return c, w, h


def preview(items):
    W, H = 980, 640
    base = Image.new("RGBA", (W, H), (26, 34, 24, 255))
    d = ImageDraw.Draw(base)
    d.text((28, 16), "建筑立绘 · 按占地摆放 · 与兵卒同一缩放", font=f(20), fill=(232, 196, 106, 255))
    d.text((28, 48), "看的是：底边是否正好坐在菱形下顶点、体量是否和格子对得上。",
           font=f(12), fill=(160, 175, 160, 255))

    foot = Image.open(os.path.join(UNITS, "bingzu_c.png")).convert("RGBA")

    for i, (art, name, w, h) in enumerate(items):
        cx = 190 + (i % 3) * 290
        cy = 190 + (i // 3) * 250
        hw, hh = (w + h) * 16, (w + h) * 8
        d.polygon([(cx - hw, cy), (cx, cy - hh), (cx + hw, cy), (cx, cy + hh)],
                  fill=(58, 82, 48, 255), outline=(86, 112, 66, 255))
        bot = cy + hh
        base.alpha_composite(art, (cx - art.width // 2, bot - (art.height - GAP)))
        d.text((cx - 40, bot + 8), f"{name}  {w}×{h}", font=f(12), fill=(200, 200, 185, 255))

    # 兵卒做比例参考
    s = 0.72
    b = foot.resize((round(foot.width * s), round(foot.height * s)), Image.LANCZOS)
    base.alpha_composite(b, (190 + 96 + 20, round(190 + 64 - 124 * s + 3)))

    base.convert("RGB").save(os.path.join(UNITS, "preview-buildings.png"), quality=95)
    print("saved preview-buildings.png")


if __name__ == "__main__":
    arts = [make(j[0], j[2], j[3], j[4]) for j in JOBS]
    preview([(a[0], j[1], j[3], j[4]) for a, j in zip(arts, JOBS)])
