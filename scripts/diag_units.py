# -*- coding: utf-8 -*-
"""检查立绘两帧是否对得上：内容高、底边行、水平中心。"""
import os
import numpy as np
from PIL import Image

UNITS = r"D:\112233\2026.11.16游戏\assets\units"

PAIRS = [
    ("兵卒", "bingzu_c.png", "bingzu_c_walk.png"),
    ("侦察兵", "scout.png", "scout_walk.png"),
    ("工匠", "gongjiang.png", "gongjiang_walk.png"),
    ("弓弩手", "han_caiguan.png", "han_caiguan_walk.png"),
    ("江东子弟", "chu_zidi.png", "chu_zidi_walk.png"),
    ("骑兵", "qingqi.png", "qingqi_walk.png"),
]


def box(name):
    im = Image.open(os.path.join(UNITS, name)).convert("RGBA")
    a = np.array(im)[..., 3]
    rows = np.where((a > 60).any(axis=1))[0]
    cols = np.where((a > 60).any(axis=0))[0]
    solid = np.where((a > 140).any(axis=1))[0]
    return im.width, rows.min(), rows.max(), solid.max(), cols.min(), cols.max(), (cols.min() + cols.max()) / 2


print(f"{'单位':<10} {'帧':<6} {'顶':>4} {'底':>4} {'实心底':>6} {'左':>4} {'右':>4} {'中心':>6}")
for label, a, b in PAIRS:
    for tag, name in (("站立", a), ("迈步", b)):
        if not os.path.exists(os.path.join(UNITS, name)):
            print(f"{label:<10} {tag:<6} 缺失 {name}")
            continue
        w, top, bot, solid, left, right, cen = box(name)
        print(f"{label:<10} {tag:<6} {top:>4} {bot:>4} {solid:>6} {left:>4} {right:>4} {cen:>6.1f}"
              f"  宽{right-left+1:>3} 高{bot-top+1:>3}")
