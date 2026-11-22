# -*- coding: utf-8 -*-
"""载具立绘对齐：内容高度归一，但宽度超过画布时按宽度收，避免被裁边。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT = r"C:\Windows\Fonts\msyh.ttc"
CANVAS, FOOT_Y = 128, 124
MAX_W = 126          # 左右各留 1px

# kind, 中文名, 源文件, 内容高度, 去饱和
JOBS = [
    ("grainCart", "粮车", "grainCart_raw.png", 100, 0.4),
    ("zhanche", "战车", "zhanche_raw.png", 110, 0.4),
    ("zhuangche", "撞城车", "zhuangche_raw.png", 110, 0.35),
    ("weixiuche", "维修车", "weixiuche_raw.png", 104, 0.4),
    ("mcv", "军旗兵", "mcv_raw.png", 120, 0.35),
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


def align(im, art_h):
    k = min(art_h / im.height, MAX_W / im.width)
    w, h = round(im.width * k), round(im.height * k)
    body = im.resize((w, h), Image.LANCZOS)
    c = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    c.alpha_composite(body, ((CANVAS - w) // 2, FOOT_Y - h))
    return c


def tint(im, c):
    a = np.array(im).astype(np.float32)
    for i in range(3):
        a[..., i] *= c[i] / 255.0
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def main():
    arts = []
    for kind, name, raw, art_h, ds in JOBS:
        im = crop(cutout(Image.open(os.path.join(UNITS, raw))))
        im = desat(im, ds)
        a = align(im, art_h)
        a.save(os.path.join(UNITS, f"{kind}_v.png"))
        arts.append((a, name))
        print(kind, "src", im.size, "->", a.getbbox())

    # 预览：一格地面 + 兵卒参考
    W, H = 1040, 430
    base = Image.new("RGBA", (W, H), (26, 34, 24, 255))
    d = ImageDraw.Draw(base)
    d.text((28, 14), "载具立绘 · 一格地面 · 与兵卒同一缩放", font=f(20), fill=(232, 196, 106, 255))
    d.text((28, 46), "看的是：轮子是否压在地面上、体量会不会显得比兵卒大太多。",
           font=f(12), fill=(160, 175, 160, 255))

    foot = Image.open(os.path.join(UNITS, "bingzu_c.png")).convert("RGBA")
    sb = 0.72
    bimg = foot.resize((round(foot.width * sb), round(foot.height * sb)), Image.LANCZOS)

    for i, (a, name) in enumerate(arts):
        cx, cy = 120 + i * 195, 240
        d.polygon([(cx - 32, cy), (cx, cy - 16), (cx + 32, cy), (cx, cy + 16)],
                  fill=(58, 82, 48, 255), outline=(86, 112, 66, 255))
        s = 0.72
        img = a.resize((round(a.width * s), round(a.height * s)), Image.LANCZOS)
        base.alpha_composite(img, (cx - img.width // 2, round(cy + 16 - 124 * s)))
        d.text((cx - 34, cy + 40), name, font=f(13), fill=(200, 200, 185, 255))

    base.alpha_composite(bimg, (1040 - bimg.width - 10, round(240 + 16 - 124 * sb)))

    base.convert("RGB").save(os.path.join(UNITS, "preview-vehicles.png"), quality=95)
    print("saved preview-vehicles.png")


if __name__ == "__main__":
    main()
