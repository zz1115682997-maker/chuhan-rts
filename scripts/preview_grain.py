from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(BASE, '..', 'assets', 'terrain')
U = os.path.join(BASE, '..', 'assets', 'units')

W, H = 900, 380
canvas = Image.new('RGB', (W, H))
grass = Image.open(os.path.join(T, 'grass.jpg')).convert('RGB').resize((320, 320), Image.LANCZOS)
for x in range(0, W, 320):
    for y in range(0, H, 320):
        canvas.paste(grass, (x, y))

BASE_Y = 300


def stand(path, x, drop=0):
    im = Image.open(path).convert('RGBA')
    canvas.paste(im, (int(x - im.width / 2), BASE_Y - im.height + drop), im)


stand(os.path.join(U, 'grainCart_v.png'), 260)
stand(os.path.join(U, 'bingzu_c.png'), 520, -2)
stand(os.path.join(U, 'canglin_art.png'), 740)
stand(os.path.join(T, 'tree.png'), 90)

canvas.save(os.path.join(T, 'preview-grain.png'))
print('ok')
