from PIL import Image
import os

RAW = os.path.join('..', 'assets', 'terrain', '_raw')
OUT = os.path.join('..', 'assets', 'terrain')

# 地表：统一缩到 320×320（用于 canvas 映射，平铺时看不出像素）
for name in ['grass', 'dirt', 'water', 'rock']:
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB')
    im = im.resize((320, 320), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.jpg'), quality=88)
    print('surface', name, im.size)

# 装饰：裁掉透明/白边，按目标高度等比缩放
TARGET_H = {'tree': 116, 'stones': 54, 'hill': 108, 'reeds': 46}
for name, h in TARGET_H.items():
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGBA')
    # 如果背景是白的（没透明），把接近纯白的像素抠掉
    px = im.load()
    w0, h0 = im.size
    for y in range(h0):
        for x in range(w0):
            r, g, b, a = px[x, y]
            if a > 200 and r > 235 and g > 235 and b > 235:
                px[x, y] = (r, g, b, 0)
    bbox = im.split()[3].getbbox()
    if bbox:
        im = im.crop(bbox)
    scale = h / im.height
    im = im.resize((max(1, int(im.width * scale)), h), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'))
    print('deco', name, im.size)
