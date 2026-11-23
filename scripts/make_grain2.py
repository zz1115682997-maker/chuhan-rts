from PIL import Image, ImageDraw
import os

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, '..', 'assets', 'terrain', '_raw3')
UNITS = os.path.join(BASE, '..', 'assets', 'units')


def cut_white(path, tol=45):
    im = Image.open(path).convert('RGB')
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


im = cut_white(os.path.join(RAW, 'grainCart.png'))
# 去掉底部残留的淡影线：按不透明像素的最低一行裁掉过于透明的边
alpha = im.split()[3]
bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
im = im.crop(bbox)

MAXW = 126
scale = MAXW / im.width
body = im.resize((MAXW, max(1, int(im.height * scale))), Image.LANCZOS)

canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
canvas.paste(body, (64 - body.width // 2, 124 - body.height), body)
canvas.save(os.path.join(UNITS, 'grainCart_v.png'))
print('body', body.size, '-> canvas 128x128, foot y=124')
