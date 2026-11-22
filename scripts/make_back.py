"""把六张背面立绘处理成 128x128、脚心钉中线，与站立帧同密度。"""
import numpy as np
from PIL import Image

CANVAS = 128
FOOT_Y = 124

# (原图, 输出, 站立帧内容高度)
JOBS = [
    ('bingzu_c_back_raw.png', 'bingzu_c_back.png', 100),
    ('scout_back_raw.png', 'scout_back.png', 80),
    ('gongjiang_back_raw.png', 'gongjiang_back.png', 94),
    ('han_caiguan_back_raw.png', 'han_caiguan_back.png', 84),
    ('chu_zidi_back_raw.png', 'chu_zidi_back.png', 104),
    ('qingqi_back_raw.png', 'qingqi_back.png', 112),
]


def cut(im):
    a = np.array(im.convert('RGBA')).astype(np.int16)
    alpha = a[:, :, 3]
    rgb = a[:, :, :3]
    mask = alpha > 8
    mask &= ~(rgb.min(axis=2) > 238)
    if not mask.any():
        raise SystemExit('empty alpha')
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    return a[max(0, y0):y1 + 1, max(0, x0):x1 + 1], mask[y0:y1 + 1, x0:x1 + 1]


def foot_cx(sub_mask):
    h = sub_mask.shape[0]
    band = sub_mask[max(0, h - 6):, :]
    col = band.any(axis=0)
    if not col.any():
        return sub_mask.shape[1] / 2
    weights = band.sum(axis=0)
    return float((np.arange(len(col))[col] * weights[col]).sum() / weights[col].sum())


for src, out, stand_h in JOBS:
    im = Image.open('assets/units/' + src)
    sub, m = cut(im)
    h, w = sub.shape[:2]
    s = min(stand_h / h, 126 / w)
    img = Image.fromarray(sub.astype('uint8'), 'RGBA').resize(
        (max(1, round(w * s)), max(1, round(stand_h)),), Image.LANCZOS
    )
    m2 = Image.fromarray((m * 255).astype('uint8'), 'L').resize(img.size, Image.LANCZOS)
    m2 = m2.point(lambda v: 255 if v > 90 else 0)
    img.putalpha(m2)

    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    cx = foot_cx(np.array(m2) > 0)
    canvas.alpha_composite(img, (round(CANVAS / 2 - cx), FOOT_Y - img.size[1]))
    canvas.save('assets/units/' + out)
    print(f'{out}: {img.size[0]}x{img.size[1]}')

PAIRS = [
    ('bingzu_c.png', 'bingzu_c_back.png'),
    ('scout.png', 'scout_back.png'),
    ('gongjiang.png', 'gongjiang_back.png'),
    ('han_caiguan.png', 'han_caiguan_back.png'),
    ('chu_zidi.png', 'chu_zidi_back.png'),
    ('qingqi.png', 'qingqi_back.png'),
]
SC = 0.5625
CW, CH = 150, 190
sheet = Image.new('RGBA', (CW * 6, CH * 2 + 20), (236, 232, 222, 255))
for i, (front, back) in enumerate(PAIRS):
    for row, name in enumerate([front, back]):
        pic = Image.open('assets/units/' + name).resize((round(128 * SC * 2), round(128 * SC * 2)), Image.LANCZOS)
        sheet.alpha_composite(pic, (i * CW + 5, row * CH + 10))
sheet.save('assets/units/preview-back.png')
print('preview-back.png written')
