# -*- coding: utf-8 -*-
"""把所有会走路的兵种两帧的脚心钉在画布中线，消除切帧时的水平跳。"""
import os
import numpy as np
from PIL import Image

UNITS = r"D:\112233\2026.11.16游戏\assets\units"
CANVAS = 128
TARGET = CANVAS // 2

PAIRS = ["bingzu_c", "scout", "gongjiang", "han_caiguan", "chu_zidi", "qingqi"]


def foot_cx(im, band=7):
    a = np.array(im.convert("RGBA"))[..., 3].astype(np.float32)
    rows = np.where((a > 100).any(axis=1))[0]
    if len(rows) == 0:
        return im.width / 2
    bot = rows.max()
    seg = a[max(0, bot - band + 1):bot + 1]
    w = seg.sum(axis=0)
    if w.sum() <= 0:
        return im.width / 2
    return float((w * np.arange(len(w))).sum() / w.sum())


def bbox(im, t=40):
    a = np.array(im)[..., 3]
    rows = np.where((a > t).any(axis=1))[0]
    cols = np.where((a > t).any(axis=0))[0]
    return cols.min(), rows.min(), cols.max(), rows.max()


for base in PAIRS:
    for suffix in ("", "_walk"):
        path = os.path.join(UNITS, f"{base}{suffix}.png")
        if not os.path.exists(path):
            print("missing", path)
            continue
        im = Image.open(path).convert("RGBA")
        cx = foot_cx(im)
        shift = int(round(TARGET - cx))
        left, top, right, bot = bbox(im)
        # 允许裁掉最多 12px 的边角（骑兵奔跑帧宽度接近满画布），保证脚心尽量归位
        if left + shift < -12:
            shift = -12 - left
        if right + shift > CANVAS - 1:
            shift = CANVAS - 1 - right
        out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        out.alpha_composite(im, (shift, 0))
        out.save(path)
        print(f"{base}{suffix:<5} foot {cx:6.1f} -> {foot_cx(out):6.1f} shift {shift:+d} "
              f"bbox {left + shift}..{right + shift}")
