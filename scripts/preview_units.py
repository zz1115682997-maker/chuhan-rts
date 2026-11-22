# -*- coding: utf-8 -*-
"""人形兵种统一对齐：每个兵种一个内容高度和去饱和系数，输出 128 画布 + 对比图。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT = r"C:\Windows\Fonts\msyh.ttc"
CANVAS, FOOT_Y = 128, 124
HAN, CHU = (91, 155, 213), (209, 90, 74)

# kind, 源文件, 内容高度, 去饱和, 裁剪阈值
JOBS = [
    ("bingzu", "bingzu_c_raw.png", 100, 0.0, 8),
    ("scout", "scout_raw.png", 80, 0.0, 40),
    ("gongjiang", "gongjiang_raw.png", 94, 0.45, 40),
    ("han_caiguan", "han_caiguan_raw.png", 84, 0.6, 40),
    ("chu_zidi", "chu_zidi_raw.png", 104, 0.0, 40),
    ("qingqi", "qingqi_raw.png", 112, 0.5, 40),
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
    ys, xs = np.where(al > t)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def desat(im, factor):
    if factor <= 0:
        return im
    alpha = im.split()[3]
    hsv = im.convert("RGB").convert("HSV")
    h, s, v = hsv.split()
    s = s.point(lambda x: int(x * factor))
    rgb = Image.merge("HSV", (h, s, v)).convert("RGB")
    rgb.putalpha(alpha)
    return rgb


def align(im, art_h, t=40):
    al = np.array(im)[..., 3]
    rows = np.where((al > t).any(axis=1))[0]
    cols = np.where((al > t).any(axis=0))[0]
    solid = np.where((al > 100).any(axis=1))[0]
    y0 = rows.min()
    y1 = max(solid.max() + 1, y0 + 1)   # 底部取实心脚，不吃半透明边
    im = im.crop((cols.min(), y0, cols.max() + 1, y1))
    k = art_h / im.height
    w, h = round(im.width * k), art_h
    body = im.resize((w, h), Image.LANCZOS)
    c = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    c.alpha_composite(body, ((CANVAS - w) // 2, FOOT_Y - h))
    return c


def tint(im, c):
    a = np.array(im).astype(np.float32)
    for i in range(3):
        a[..., i] *= c[i] / 255.0
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def diamond(d, cx, cy, w, h):
    d.polygon([(cx, cy - h // 2), (cx + w // 2, cy), (cx, cy + h // 2), (cx - w // 2, cy)],
              fill=(52, 78, 44, 255), outline=(78, 104, 62, 255))


def shadow(base, cx, cy):
    im = Image.new("RGBA", (48, 17), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([0, 0, 47, 16], fill=(0, 0, 0, 78))
    base.alpha_composite(im, (cx - 24, cy - 6))


def blit(base, art, cx, foot, s=0.72):
    w, h = round(art.width * s), round(art.height * s)
    base.alpha_composite(art.resize((w, h), Image.LANCZOS), (cx - w // 2, foot + 3 - h))


def main():
    arts = {}
    for kind, fn, art_h, ds, th in JOBS:
        p = os.path.join(UNITS, fn)
        if not os.path.exists(p):
            print("missing", fn)
            continue
        im = crop(cutout(Image.open(p)), th)
        im = desat(im, ds)
        a = align(im, art_h, 8 if kind == "bingzu" else 40)
        a.save(os.path.join(UNITS, f"{kind}_C.png"))
        arts[kind] = a
        print(kind, "src", im.size, "->", a.getbbox())

    order = [("bingzu", "兵卒"), ("scout", "侦察兵"), ("gongjiang", "工匠"),
             ("han_caiguan", "弓弩手"), ("chu_zidi", "江东子弟"), ("qingqi", "骑兵")]
    W, H = 1200, 780
    base = Image.new("RGBA", (W, H), (14, 20, 15, 255))
    d = ImageDraw.Draw(base)
    d.text((30, 18), "人形兵种 · 汉蓝染色 · 同一缩放", font=f(21), fill=(232, 196, 106, 255))
    d.text((30, 50), "看的是彼此体量关系：兵卒居中、斥候轻、工匠壮、弩手稳、子弟魁。",
           font=f(13), fill=(160, 175, 160, 255))

    for col_i, (col, tag) in enumerate([(HAN, "汉蓝"), (CHU, "楚红")]):
        for i, (k, label) in enumerate(order):
            if k not in arts:
                continue
            cx, cy = 90 + i * 190, 200 + col_i * 240
            diamond(d, cx, cy, 64, 32)
            shadow(base, cx, cy)
            blit(base, tint(arts[k], col), cx, cy)
            d.text((cx - 30, cy + 26), f"{label}·{tag}", font=f(12), fill=(200, 200, 185, 255))

    d.text((30, 660), "本色", font=f(13), fill=(180, 185, 170, 255))
    for i, (k, label) in enumerate(order):
        if k not in arts:
            continue
        blit(base, arts[k], 90 + i * 190, 710)

    base.convert("RGB").save(os.path.join(UNITS, "preview-team2.png"), quality=95)
    print("saved preview-team2.png")


if __name__ == "__main__":
    main()

