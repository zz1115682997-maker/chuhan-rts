# -*- coding: utf-8 -*-
"""只重做兵卒迈步帧：沿用站立帧的像素密度，按脚心对齐，不动站立帧。"""
import os
import numpy as np
from PIL import Image

UNITS = r"D:\112233\2026.11.16游戏\assets\units"
CANVAS, FOOT_Y = 128, 124


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


def foot_cx(im, band=7):
    a = np.array(im.convert("RGBA"))[..., 3].astype(np.float32)
    rows = np.where((a > 100).any(axis=1))[0]
    bot = rows.max()
    seg = a[max(0, bot - band + 1):bot + 1]
    w = seg.sum(axis=0)
    if w.sum() <= 0:
        return im.width / 2
    return float((w * np.arange(len(w))).sum() / w.sum())


def foot_bottom(im):
    a = np.array(im.convert("RGBA"))[..., 3]
    return int(np.where((a > 100).any(axis=1))[0].max())


stand_raw = crop(cutout(Image.open(os.path.join(UNITS, "bingzu_c_raw.png")), 8))
walk_raw = crop(cutout(Image.open(os.path.join(UNITS, "bingzu_c_walk_raw.png")), 70))

# 站立帧的像素密度：内容高 100 -> 站立图内容高 100（ART_H=100）
k = 100 / stand_raw.height
print("stand_raw", stand_raw.size, "k", round(k, 4), "walk_raw", walk_raw.size)

ww, wh = round(walk_raw.width * k), round(walk_raw.height * k)
wb = walk_raw.resize((ww, wh), Image.LANCZOS)

c = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
c.alpha_composite(wb, ((CANVAS - ww) // 2, FOOT_Y - wh))

stand = Image.open(os.path.join(UNITS, "bingzu_c.png")).convert("RGBA")
cx_stand = foot_cx(stand)
cx_walk = foot_cx(c)
shift = round(cx_stand - cx_walk)
print("foot cx stand", round(cx_stand, 1), "walk", round(cx_walk, 1), "shift", shift)

final = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
final.alpha_composite(c, (shift, 0))
final.save(os.path.join(UNITS, "bingzu_c_walk.png"))

# 复核
for name, img in (("站立", stand), ("迈步", final)):
    a = np.array(img)[..., 3]
    rows = np.where((a > 60).any(axis=1))[0]
    cols = np.where((a > 60).any(axis=0))[0]
    print(name, "顶", rows.min(), "底", rows.max(), "高", rows.max() - rows.min() + 1,
          "中心", round((cols.min() + cols.max()) / 2, 1), "脚cx", round(foot_cx(img), 1))
