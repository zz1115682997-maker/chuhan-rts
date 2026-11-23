"""按红警2 的装饰比例把地形装饰缩回去。

RA2 参考：格子 60x30 px；兵营 2x2；树是单格 overlay，宽约 45-55px（≈0.8 格），
比兵营矮一截。我们格子 64x32、兵营立绘 128x106，所以：
  树   128 * 0.6 ≈ 76  -> 取高 76
  碎石 约 0.75 格宽    -> 取高 30
  石山 约 1.1 格宽    -> 取高 72
  芦苇 贴地小丛        -> 取高 26
"""
from PIL import Image
import os

T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'terrain')

TARGET_H = {'tree': 76, 'stones': 30, 'hill': 72, 'reeds': 26}

for name, h in TARGET_H.items():
    p = os.path.join(T, name + '.png')
    im = Image.open(p).convert('RGBA')
    box = im.split()[3].getbbox()
    if box:
        im = im.crop(box)
    w = max(1, round(im.width * h / im.height))
    im = im.resize((w, h), Image.LANCZOS)
    im.save(p)
    print(name, im.size)
