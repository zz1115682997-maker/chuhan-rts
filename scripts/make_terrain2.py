from PIL import Image, ImageEnhance, ImageOps, ImageDraw
import os

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, '..', 'assets', 'terrain', '_raw2')
OUT = os.path.join(BASE, '..', 'assets', 'terrain')
UNITS = os.path.join(BASE, '..', 'assets', 'units')


def cut_white(name, tol=42):
    """只抠与画面四角连通的白色，粮袋那种被包在中间的浅色不会被掏空。"""
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB')
    magic = (255, 0, 255)
    w, h = im.size
    for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]:
        try:
            ImageDraw.floodfill(im, pt, magic, thresh=tol)
        except Exception:
            pass
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if (r, g, b) == magic:
                px[x, y] = (0, 0, 0, 0)
    bbox = im.split()[3].getbbox()
    return im.crop(bbox) if bbox else im


# ---------------- 地表：压一点饱和，往灰白淡彩靠 ----------------
SAT = {'grass': 0.84, 'dirt': 0.88, 'water': 0.96, 'rock': 0.9}
for name, s in SAT.items():
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB')
    im = ImageEnhance.Color(im).enhance(s)
    im = ImageEnhance.Brightness(im).enhance(1.04)
    im = im.resize((320, 320), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.jpg'), quality=90)
    print('surface', name, im.size)

# ---------------- 装饰：高度对齐原来的口径，底边就是图底 ----------------
DECO = {'tree': 116, 'stones': 54, 'hill': 108, 'reeds': 46}
for name, h in DECO.items():
    im = cut_white(name)
    im = im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'))
    print('deco', name, im.size)

# ---------------- 水塔：建筑立绘，底边贴画布底部 ----------------
im = cut_white('shuaita')
h = 132
if im.width * h / im.height > 140:
    h = int(140 * im.height / im.width)
im = im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)
im.save(os.path.join(UNITS, 'shuaita_art.png'))
print('shuaita', im.size)

# ---------------- 粮车：牛朝右，脚底对齐 ART_FOOT_Y=124，画布 128 ----------------
im = cut_white('grainCart')
im = ImageOps.mirror(im)  # 原图牛头朝左，翻过来才是朝右前拉
h = 104
if im.width * h / im.height > 126:
    h = int(126 * im.height / im.width)
im = im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)
canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
canvas.paste(im, (64 - im.width // 2, 124 - im.height), im)
canvas.save(os.path.join(UNITS, 'grainCart_v.png'))
print('grainCart', canvas.size, 'body', im.size)
