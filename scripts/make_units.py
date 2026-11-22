# -*- coding: utf-8 -*-
"""按兵种把立绘对齐到统一画布，并把暖色（草黄斗笠）去饱和，避免染色发脏。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"
CANVAS, FOOT_Y = 128, 124
HAN, CHU = (91, 155, 213), (209, 90, 74)

# 内容高度按兵种区分：兵卒含长矛所以更高，其他按「人身高」对齐
ART_H = {"bingzu_c": 100, "scout": 80, "gongjiang": 94}


def font(s):
    try:
        return ImageFont.truetype(FONT_PATH, s)
    except Exception:
        return ImageFont.load_default()


def cutout(im, thresh=70):
    im = im.convert("RGBA")
    a = np.array(im).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if al.min() < 5:
        return im
    dist = np.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2)
    a[..., 3] = np.clip((dist - thresh) / 40.0 * 255.0, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def crop(im, t=40):
    al = np.array(im)[..., 3]
    ys, xs = np.where(al > t)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def desat(im, factor=0.5):
    alpha = im.split()[3]
    hsv = im.convert("RGB").convert("HSV")
    h, s, v = hsv.split()
    s = s.point(lambda x: int(x * factor))
    rgb = Image.merge("HSV", (h, s, v)).convert("RGB")
    rgb.putalpha(alpha)
    return rgb


def align(im, art_h):
    # 再精裁一次，确保底部就是实心脚底，而不是半透明噪点
    al = np.array(im)[..., 3]
    ys, xs = np.where(al > 40)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
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


def shadow(base, cx, cy, s):
    w, h = int(42 * s), int(15 * s)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([0, 0, w - 1, h - 1], fill=(0, 0, 0, 78))
    base.alpha_composite(im, (cx - w // 2, cy - h // 2 + 2))


def blit(base, art, cx, foot, s):
    w, h = round(art.width * s), round(art.height * s)
    base.alpha_composite(art.resize((w, h), Image.LANCZOS), (cx - w // 2, foot + 3 - h))


def main():
    files = {"bingzu": "bingzu_c_raw.png", "scout": "scout_raw.png", "gongjiang": "gongjiang_raw.png"}
    arts = {}
    for k, fn in files.items():
        p = os.path.join(UNITS, fn)
        if not os.path.exists(p):
            print("missing", fn)
            continue
        im = crop(cutout(Image.open(p)), 8 if k == "bingzu" else 40)
        if k == "gongjiang":
            im = desat(im, 0.45)
        a = align(im, ART_H[k if k != "bingzu" else "bingzu_c"])
        a.save(os.path.join(UNITS, f"{k}_C.png"))
        arts[k] = a
        print(k, "raw", im.size, "-> canvas content", a.getbbox())

    W, H = 1080, 700
    base = Image.new("RGBA", (W, H), (14, 20, 15, 255))
    d = ImageDraw.Draw(base)
    d.text((32, 20), "第一批三兵种 · 同身高基准 · 汉蓝染色", font=font(21), fill=(232, 196, 106, 255))
    d.text((32, 54), "按人的身高对齐，不是按包围盒；工匠已去饱和，蓝染后不应发绿。",
           font=font(13), fill=(160, 175, 160, 255))

    order = [("bingzu", "兵卒"), ("scout", "侦察兵"), ("gongjiang", "工匠")]
    for row, (col, tag) in enumerate([(HAN, "汉蓝"), (CHU, "楚红")]):
        for i, (k, label) in enumerate(order):
            if k not in arts:
                continue
            cx, cy = 110 + i * 300, 190 + row * 230
            diamond(d, cx, cy, 64, 32)
            shadow(base, cx, cy, 1.15)
            blit(base, tint(arts[k], col), cx, cy, 0.72)
            d.text((cx - 24, cy + 26), f"{label}·{tag}", font=font(13), fill=(200, 200, 185, 255))

    # 参考：本色
    d.text((32, 610), "本色（未染色）", font=font(13), fill=(180, 185, 170, 255))
    for i, (k, label) in enumerate(order):
        if k not in arts:
            continue
        cx = 110 + i * 300
        blit(base, arts[k], cx, 660, 0.72)

    base.convert("RGB").save(os.path.join(UNITS, "preview-team.png"), quality=95)
    print("saved preview-team.png")


if __name__ == "__main__":
    main()
