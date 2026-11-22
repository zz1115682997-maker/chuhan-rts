# -*- coding: utf-8 -*-
"""按站立帧的缩放基准对齐迈步帧，保证走动时人不忽大忽小。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\112233\2026.11.16游戏"
UNITS = os.path.join(ROOT, "assets", "units")
FONT = r"C:\Windows\Fonts\msyh.ttc"
CANVAS, FOOT_Y = 128, 124
HAN = (91, 155, 213)

JOBS = [
    ("scout", "scout_raw.png", "scout_walk_raw.png", 80, 0.0),
    ("gongjiang", "gongjiang_raw.png", "gongjiang_walk_raw.png", 94, 0.45),
    ("han_caiguan", "han_caiguan_raw.png", "han_caiguan_walk_raw.png", 84, 0.6),
    ("chu_zidi", "chu_zidi_raw.png", "chu_zidi_walk_raw.png", 104, 0.0),
    ("qingqi", "qingqi_raw.png", "qingqi_walk_raw.png", 112, 0.5),
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
    alpha = im.split()[3]
    hsv = im.convert("RGB").convert("HSV")
    h, s, v = hsv.split()
    s = s.point(lambda x: int(x * factor))
    rgb = Image.merge("HSV", (h, s, v)).convert("RGB")
    rgb.putalpha(alpha)
    return rgb


def place(im, k):
    w, h = round(im.width * k), round(im.height * k)
    body = im.resize((w, h), Image.LANCZOS)
    y = FOOT_Y - h
    if y < 0:
        body = body.crop((0, -y, w, h))
        y = 0
    c = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    c.alpha_composite(body, ((CANVAS - w) // 2, y))
    return c, (w, h)


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
    out = {}
    for kind, sfn, wfn, art_h, ds in JOBS:
        stand = crop(cutout(Image.open(os.path.join(UNITS, sfn))))
        walk = crop(cutout(Image.open(os.path.join(UNITS, wfn))))
        if ds:
            stand = desat(stand, ds)
            walk = desat(walk, ds)
        k = art_h / stand.height
        wk = art_h / walk.height      # 两帧都按同一内容高度，抵消 AI 画小的一圈
        if kind == "qingqi":
            wk *= 0.92                # 奔跑四蹄张开，按高度对齐会显得马变大，压回一点
        sc, sc_size = place(stand, k)
        wc, wc_size = place(walk, wk)
        sc.save(os.path.join(UNITS, f"{kind}.png"))
        wc.save(os.path.join(UNITS, f"{kind}_walk.png"))
        out[kind] = (sc, wc)
        print(kind, "stand", stand.size, "walk", walk.size,
              "ratio", round(walk.height / stand.height, 3), "->", sc_size, wc_size)

    W, H = 1040, 1160
    base = Image.new("RGBA", (W, H), (14, 20, 15, 255))
    d = ImageDraw.Draw(base)
    d.text((30, 18), "站立 / 迈步 配对检查", font=f(21), fill=(232, 196, 106, 255))
    d.text((30, 50), "两帧高度应一致；走路交替时不应明显跳大小。", font=f(13), fill=(160, 175, 160, 255))

    rows = [("侦察兵", "scout"), ("工匠", "gongjiang"), ("弓弩手", "han_caiguan"), ("江东子弟", "chu_zidi"), ("骑兵", "qingqi")]
    for i, (label, k) in enumerate(rows):
        if k not in out:
            continue
        cx0 = 300
        for j, (art, tag) in enumerate([(out[k][0], "站立"), (out[k][1], "迈步")]):
            cx, cy = cx0 + j * 170, 150 + i * 185
            diamond(d, cx, cy, 64, 32)
            shadow(base, cx, cy)
            blit(base, tint(art, HAN), cx, cy)
            d.text((cx - 22, cy + 26), tag, font=f(13), fill=(200, 200, 185, 255))
        d.text((40, 130 + i * 185), label, font=f(15), fill=(215, 215, 195, 255))

    # 交替序列
    d.text((30, 1080), "交替（站→迈→站→迈）", font=f(13), fill=(180, 185, 170, 255))
    seq = []
    for k in ["scout", "gongjiang", "han_caiguan", "chu_zidi", "qingqi"]:
        if k in out:
            seq.extend([out[k][0], out[k][1]])
    for i, a in enumerate(seq[:8]):
        cx, cy = 200 + i * 90, 1120
        diamond(d, cx, cy, 52, 26)
        blit(base, tint(a, HAN), cx, cy, 0.6)

    base.convert("RGB").save(os.path.join(UNITS, "preview-walk-team.png"), quality=95)
    print("saved preview-walk-team.png")


if __name__ == "__main__":
    main()
