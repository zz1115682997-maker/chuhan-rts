"""把六张攻击帧原图处理成 128x128、脚心钉中线的游戏用图。"""
import numpy as np
from PIL import Image

CANVAS = 128
FOOT_Y = 124

# (原图, 输出, 站立帧内容高度, 折算系数, 是否需要镜像)
JOBS = [
    ('bingzu_c_atk_raw.png', 'bingzu_c_atk.png', 100, 1.06, False),
    ('scout_atk_raw.png', 'scout_atk.png', 80, 1.06, False),
    ('gongjiang_atk_raw.png', 'gongjiang_atk.png', 94, 1.06, False),
    ('han_caiguan_atk_raw.png', 'han_caiguan_atk.png', 84, 1.06, False),
    ('chu_zidi_atk_raw.png', 'chu_zidi_atk.png', 104, 1.06, False),
    ('qingqi_atk_raw.png', 'qingqi_atk.png', 112, 1.0, False),
]


def cut(im):
    a = np.array(im.convert('RGBA')).astype(np.int16)
    alpha = a[:, :, 3]
    rgb = a[:, :, :3]
    mask = alpha > 8
    mask &= ~(rgb.min(axis=2) > 238)  # 去掉残留白边
    if not mask.any():
        raise SystemExit('empty alpha')
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    return a[max(0, y0):y1 + 1, max(0, x0):x1 + 1], mask[y0:y1 + 1, x0:x1 + 1]


def foot_cx(sub_mask):
    h = sub_mask.shape[0]
    band = sub_mask[max(0, h - 6):, :]
    xs = np.where(band.any(axis=0))[0]
    if len(xs) == 0:
        return sub_mask.shape[1] / 2
    col = band.any(axis=0)
    weights = band.sum(axis=0)
    return float((np.arange(len(col))[col] * weights[col]).sum() / weights[col].sum())


for src, out, stand_h, k, flip in JOBS:
    im = Image.open('assets/units/' + src)
    sub, m = cut(im)
    if flip:
        sub = sub[:, ::-1]
        m = m[:, ::-1]
    h, w = sub.shape[:2]
    target_h = stand_h * k
    s = min(target_h / h, 126 / w)  # 武器横伸太宽时按宽度保底，宁可矮一点也不出画
    img = Image.fromarray(sub.astype('uint8'), 'RGBA').resize(
        (max(1, round(w * s)), max(1, round(target_h)),), Image.LANCZOS
    )
    m2 = Image.fromarray((m * 255).astype('uint8'), 'L').resize(img.size, Image.LANCZOS)
    m2 = m2.point(lambda v: 255 if v > 90 else 0)
    img.putalpha(m2)

    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    arr_mask = np.array(m2) > 0
    cx = foot_cx(arr_mask)
    x = round(CANVAS / 2 - cx)
    y = FOOT_Y - img.size[1]
    canvas.alpha_composite(img, (x, y))
    canvas.save('assets/units/' + out)
    print(f'{out}: {img.size[0]}x{img.size[1]} 放 ({x},{y})')


# 验收图：上排站立、下排攻击，按游戏实际比例放大 2 倍
PAIRS = [
    ('bingzu_c.png', 'bingzu_c_atk.png', '兵卒'),
    ('scout.png', 'scout_atk.png', '侦察'),
    ('gongjiang.png', 'gongjiang_atk.png', '工匠'),
    ('han_caiguan.png', 'han_caiguan_atk.png', '弓弩'),
    ('chu_zidi.png', 'chu_zidi_atk.png', '子弟'),
    ('qingqi.png', 'qingqi_atk.png', '骑兵'),
]
SC = 0.5625
CW, CH = 150, 190
sheet = Image.new('RGBA', (CW * 6, CH * 2 + 20), (236, 232, 222, 255))
for i, (stand, atk, _) in enumerate(PAIRS):
    for row, name in enumerate([stand, atk]):
        pic = Image.open('assets/units/' + name)
        pic = pic.resize((round(128 * SC * 2), round(128 * SC * 2)), Image.LANCZOS)
        sheet.alpha_composite(pic, (i * CW + 5, row * CH + 10))
sheet.save('assets/units/preview-attack.png')
print('preview-attack.png written')
