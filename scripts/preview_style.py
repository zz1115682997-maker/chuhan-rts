from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(BASE, '..', 'assets', 'terrain')
U = os.path.join(BASE, '..', 'assets', 'units')

W, H = 1280, 720
bg = Image.open(os.path.join(T, 'grass.jpg')).convert('RGB').resize((640, 640), Image.LANCZOS)
for x in range(0, W, 640):
    for y in range(0, H + 640, 640):
        bg.paste(bg.copy() if False else bg, (0, 0))
canvas = Image.new('RGB', (W, H))
for x in range(0, W, 640):
    for y in range(0, H, 640):
        canvas.paste(bg, (x, y))

BASE_Y = 585


def stand(path, x, extra_drop=0):
    im = Image.open(path).convert('RGBA')
    canvas.paste(im, (int(x - im.width / 2), BASE_Y - im.height + extra_drop), im)


stand(os.path.join(T, 'tree.png'), 190)
stand(os.path.join(T, 'hill.png'), 400)
stand(os.path.join(T, 'stones.png'), 510)
stand(os.path.join(T, 'reeds.png'), 600)
stand(os.path.join(U, 'shuaita_art.png'), 800)
stand(os.path.join(U, 'grainCart_v.png'), 1010)
stand(os.path.join(U, 'bingzu_c.png'), 900, -2)
stand(os.path.join(U, 'canglin_art.png'), 1120)

# 右上角三张地表缩略
for name, x in [('dirt', 880), ('water', 1030), ('rock', 1180)]:
    th = Image.open(os.path.join(T, name + '.jpg')).convert('RGB').resize((120, 120), Image.LANCZOS)
    canvas.paste(th, (x - 60, 40))

canvas.save(os.path.join(T, 'preview-style.png'))
print('ok', canvas.size)
