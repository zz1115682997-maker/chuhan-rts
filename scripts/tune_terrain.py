from PIL import Image, ImageEnhance
import os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, '..', 'assets', 'terrain')

# 整体提亮、加对比、加饱和，往"晴天午后"靠，别再有古画那种灰闷感
# (亮度, 对比, 饱和)
TUNE = {
    'grass': (1.26, 1.16, 1.30),
    'dirt': (1.22, 1.10, 1.12),
    'water': (1.34, 1.14, 1.12),
    'rock': (1.26, 1.14, 1.08),
}

for name, (b, c, s) in TUNE.items():
    p = os.path.join(OUT, name + '.jpg')
    im = Image.open(p).convert('RGB')
    im = ImageEnhance.Brightness(im).enhance(b)
    im = ImageEnhance.Contrast(im).enhance(c)
    im = ImageEnhance.Color(im).enhance(s)
    im.save(p, quality=90)
    print('tuned', name)
