"""载具攻击帧 + 陷坑立绘处理。载具与兵种同规格（128 画布、脚底底边）；陷坑单独一张贴地小图。"""
import numpy as np
from PIL import Image

CANVAS = 128
FOOT_Y = 124

VEH = [
    ('zhanche_atk_raw.png', 'zhanche_atk.png', 110),
    ('zhuangche_atk_raw.png', 'zhuangche_atk.png', 110),
    ('weixiuche_atk_raw.png', 'weixiuche_atk.png', 104),
]


def cut(im):
    a = np.array(im.convert('RGBA')).astype(np.int16)
    mask = a[:, :, 3] > 8
    mask &= ~(a[:, :, :3].min(axis=2) > 238)
    if not mask.any():
        raise SystemExit('empty alpha')
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    return a[y0:y1 + 1, x0:x1 + 1], mask[y0:y1 + 1, x0:x1 + 1]


def foot_cx(sub_mask):
    h = sub_mask.shape[0]
    band = sub_mask[max(0, h - 6):, :]
    col = band.any(axis=0)
    if not col.any():
        return sub_mask.shape[1] / 2
    weights = band.sum(axis=0)
    return float((np.arange(len(col))[col] * weights[col]).sum() / weights[col].sum())


for src, out, art_h in VEH:
    sub, m = cut(Image.open('assets/units/' + src))
    h, w = sub.shape[:2]
    s = min(art_h / h, 126 / w)
    img = Image.fromarray(sub.astype('uint8'), 'RGBA').resize(
        (max(1, round(w * s)), max(1, round(art_h))), Image.LANCZOS)
    m2 = Image.fromarray((m * 255).astype('uint8'), 'L').resize(img.size, Image.LANCZOS)
    m2 = m2.point(lambda v: 255 if v > 90 else 0)
    img.putalpha(m2)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    cx = foot_cx(np.array(m2) > 0)
    canvas.alpha_composite(img, (round(CANVAS / 2 - cx), FOOT_Y - img.size[1]))
    canvas.save('assets/units/' + out)
    print(f'{out}: {img.size[0]}x{img.size[1]}')

# 陷坑：圆形坑口压成等距椭圆（垂直压 0.55），底边贴图底
sub, m = cut(Image.open('assets/units/xiankeng_raw.png'))
h, w = sub.shape[:2]
TW = 74
TH = round(h * (TW / w) * 0.55)
img = Image.fromarray(sub.astype('uint8'), 'RGBA').resize((TW, TH), Image.LANCZOS)
m2 = Image.fromarray((m * 255).astype('uint8'), 'L').resize(img.size, Image.LANCZOS)
m2 = m2.point(lambda v: 255 if v > 90 else 0)
img.putalpha(m2)
canvas = Image.new('RGBA', (TW + 6, TH + 4), (0, 0, 0, 0))
canvas.alpha_composite(img, (3, 4))
canvas.save('assets/units/xiankeng_art.png')
print(f'xiankeng_art.png: {TW}x{TH}')

# 验收图：左三联载具（上站立 / 下出手），右侧陷坑
PAIRS = [
    ('zhanche_v.png', 'zhanche_atk.png'),
    ('zhuangche_v.png', 'zhuangche_atk.png'),
    ('weixiuche_v.png', 'weixiuche_atk.png'),
]
SC = 0.5625
CW, CH = 170, 200
sheet = Image.new('RGBA', (CW * 3, CH * 2 + 20), (236, 232, 222, 255))
for i, (stand, atk) in enumerate(PAIRS):
    for row, name in enumerate([stand, atk]):
        pic = Image.open('assets/units/' + name).resize(
            (round(128 * SC * 2), round(128 * SC * 2)), Image.LANCZOS)
        sheet.alpha_composite(pic, (i * CW + 5, row * CH + 10))
sheet.save('assets/units/preview-tank.png')
print('preview-tank.png written')
