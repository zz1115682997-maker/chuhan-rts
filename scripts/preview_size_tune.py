# -*- coding: utf-8 -*-
"""按 0.58 / 0.72 / 0.86 三档缩放在 64×32 菱形格上排一遍，供挑尺寸。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"
HAN = (91, 155, 213)


def font(s):
    try:
        return ImageFont.truetype(FONT_PATH, s)
    except Exception:
        return ImageFont.load_default()


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
    art = Image.open(os.path.join(UNITS, "bingzu_c.png")).convert("RGBA")
    W, H = 960, 520
    base = Image.new("RGBA", (W, H), (14, 20, 15, 255))
    d = ImageDraw.Draw(base)
    d.text((32, 22), "兵卒 C · 三档显示尺寸（格子 64×32，zoom 1）", font=font(21), fill=(232, 196, 106, 255))
    d.text((32, 56), "数字是整张立绘的屏幕高度；人约占 78%，矛尖占上方。选一个，我写进默认值。",
           font=font(13), fill=(160, 175, 160, 255))

    for i, (scale, label) in enumerate([(0.58, "0.58 · 原方案"), (0.72, "0.72 · 现默认"), (0.86, "0.86 · 更大")]):
        cx = 140 + i * 300
        cy = 320
        diamond(d, cx, cy, 64, 32)
        shadow(base, cx, cy, scale * 1.6)
        blit(base, tint(art, HAN), cx, cy, scale)
        d.text((cx - 62, 380), label, font=font(15), fill=(210, 210, 190, 255))
        d.text((cx - 62, 404), f"人高约 {round(100 * scale * 0.78)}px / 格宽 64px", font=font(12), fill=(160, 170, 158, 255))

    # 一排五人看阵型
    d.text((32, 448), "五人成队（0.72）", font=font(13), fill=(180, 185, 170, 255))
    for i in range(5):
        cx = 90 + i * 52
        cy = 490
        diamond(d, cx, cy, 56, 28)
        shadow(base, cx, cy, 1.1)
        blit(base, tint(art, HAN), cx, cy, 0.72)

    base.convert("RGB").save(os.path.join(UNITS, "preview-size-tune.png"), quality=95)
    print("saved preview-size-tune.png")


if __name__ == "__main__":
    main()
