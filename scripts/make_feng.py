"""烽火台立绘：1×1 占地，塔要瘦高，所以按宽度定尺、纵向稍微拉长。"""
import numpy as np
from PIL import Image

TW, TH = 78, 112

a = Image.open('assets/units/fengjiantai_raw.png').convert('RGBA')
arr = np.array(a).astype(np.int16)
mask = arr[:, :, 3] > 8
mask &= ~(arr[:, :, :3].min(axis=2) > 238)
ys, xs = np.where(mask)
sub = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

img = Image.fromarray(sub.astype('uint8'), 'RGBA').resize((TW, TH), Image.LANCZOS)
m2 = Image.fromarray((m * 255).astype('uint8'), 'L').resize((TW, TH), Image.LANCZOS)
m2 = m2.point(lambda v: 255 if v > 90 else 0)
img.putalpha(m2)

canvas = Image.new('RGBA', (TW + 6, TH + 4), (0, 0, 0, 0))
canvas.alpha_composite(img, (3, 4))
canvas.save('assets/units/fengjiantai_art.png')
print(f'fengjiantai_art.png: {TW}x{TH}')

# 验收图：和弩台、陷坑放一起看比例
SC = 2.0
nutai = Image.open('assets/units/nutai_art.png')
feng = Image.open('assets/units/fengjiantai_art.png')
sheet = Image.new('RGBA', (400, 330), (236, 232, 222, 255))
sheet.alpha_composite(nutai.resize((int(nutai.width * SC * 0.56), int(nutai.height * SC * 0.56)), Image.LANCZOS), (10, 20))
sheet.alpha_composite(feng.resize((int(feng.width * SC * 0.56), int(feng.height * SC * 0.56)), Image.LANCZOS), (200, 20))
sheet.save('assets/units/preview-feng.png')
print('preview-feng.png written')
