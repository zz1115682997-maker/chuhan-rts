# -*- coding: utf-8 -*-
"""
把迈步帧按「站立帧的缩放基准」对齐到同一画布，避免走路时人变大变小。
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"
HAN = (91, 155, 213)
CANVAS, ART_H, FOOT_Y = 128, 100, 124


def font(s):
    try:
        return ImageFont.truetype(FONT_PATH, s)
    except Exception:
        return ImageFont.load_default()


def cutout(im):
    im = im.convert("RGBA")
    a = np.array(im).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if al.min() < 5:
        return im  # 已经是透明底，直接用自带通道
    dist = np.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2)
    a[..., 3] = np.clip((dist - 70) / 40.0 * 255.0, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def crop(im, t=8):
    al = np.array(im)[..., 3]
    ys, xs = np.where(al > t)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


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
    stand = crop(cutout(Image.open(os.path.join(UNITS, "bingzu_c_raw.png"))))
    walk = crop(cutout(Image.open(os.path.join(UNITS, "bingzu_c_walk_raw.png"))))
    print("stand", stand.size, "walk", walk.size, "ratio", round(walk.height / stand.height, 3))

    k = ART_H / stand.height      # 1 单位 = k 源像素
    stand_canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    stand_canvas.alpha_composite(
        stand.resize((round(stand.width * k), ART_H), Image.LANCZOS),
        ((CANVAS - round(stand.width * k)) // 2, FOOT_Y - ART_H),
    )

    walk_canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    w2, h2 = round(walk.width * k), round(walk.height * k)
    body = walk.resize((w2, h2), Image.LANCZOS)
    y = FOOT_Y - h2
    if y < 0:
        body = body.crop((0, -y, w2, h2))
        y = 0
    walk_canvas.alpha_composite(body, ((CANVAS - w2) // 2, y))
    walk_canvas.save(os.path.join(UNITS, "bingzu_c_walk.png"))
    print("walk aligned", body.size, "clip", max(0, h2 - FOOT_Y))

    # 对比图：两帧并排 + 行走相位
    W, H = 1120, 520
    base = Image.new("RGBA", (W, H), (14, 20, 15, 255))
    d = ImageDraw.Draw(base)
    d.text((32, 20), "兵卒 C · 站立 / 迈步（同一缩放基准）", font=font(21), fill=(232, 196, 106, 255))
    d.text((32, 54), "两者高度应完全一致；迈步帧前脚更低，后脚抬起。", font=font(13), fill=(160, 175, 160, 255))

    stand_a = stand_canvas
    walk_a = Image.open(os.path.join(UNITS, "bingzu_c_walk.png")).convert("RGBA")

    for i, (art, label) in enumerate([(stand_a, "站立"), (walk_a, "迈步")]):
        cx, cy = 180 + i * 260, 260
        diamond(d, cx, cy, 64, 32)
        shadow(base, cx, cy, 1.15)
        blit(base, tint(art, HAN), cx, cy, 0.72)
        d.text((cx - 20, 300), label, font=font(15), fill=(210, 210, 190, 255))

    # 行走相位：交替
    d.text((32, 370), "走路交替（站→迈→站）", font=font(13), fill=(180, 185, 170, 255))
    seq = [stand_a, walk_a, stand_a, walk_a]
    for i, a in enumerate(seq):
        cx, cy = 90 + i * 70, 440
        diamond(d, cx, cy, 56, 28)
        shadow(base, cx, cy, 1.05)
        blit(base, tint(a, HAN), cx, cy, 0.72)

    base.convert("RGB").save(os.path.join(UNITS, "preview-walk.png"), quality=95)
    print("saved preview-walk.png")


if __name__ == "__main__":
    main()

