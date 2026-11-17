// All art is generated procedurally at startup and baked into textures. No image
// assets on disk: placeholder geometry that still reads clearly at a glance.

import { Container, Graphics, Text } from 'pixi.js';
import type { Renderer as PixiRenderer, Texture } from 'pixi.js';
import { BUILDING_DEFS } from '../sim/stats.js';
import type { BuildingKind, UnitKind } from '../sim/types.js';
import { TILE_H, TILE_W } from './iso.js';

export const FACTION_COLOR: Record<number, number> = { 0: 0x2f6fbf, 1: 0xc0392b };
export const FACTION_LIGHT: Record<number, number> = { 0: 0x6fa8dc, 1: 0xe07a6a };
export const FACTION_DARK: Record<number, number> = { 0: 0x1b3f6e, 1: 0x6e1f16 };

const INK = 0x14161a;
const BONE = 0xf2e8d5;
const SKIN = 0xf0c9a0;
const WOOD = 0x7a5730;
const STEEL = 0xe4e7ee;
const PANTS = 0x3a342c;

export interface Baked {
  texture: Texture;
  ax: number;
  ay: number;
}

export interface TextureSet {
  units: Map<string, Baked>;
  buildings: Map<string, Baked>;
  /** small portrait used by the HUD */
  icons: Map<string, Baked>;
}

function bake(renderer: PixiRenderer, c: Container): Baked {
  const b = c.getLocalBounds();
  const texture = renderer.textureGenerator.generateTexture(c);
  return {
    texture,
    ax: b.width > 0 ? -b.x / b.width : 0.5,
    ay: b.height > 0 ? -b.y / b.height : 0.5,
  };
}

function label(text: string, size: number, y: number, color = BONE): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif',
      fontSize: size,
      fill: color,
      stroke: { color: INK, width: Math.max(2, size / 6) },
      align: 'center',
    },
  });
  t.anchor.set(0.5, 0.5);
  t.y = y;
  return t;
}

// --------------------------------------------------------------- units
// Side-view silhouettes. Both walk frames share one invisible box so the
// anchor stays on the body when the pose changes. Drawn facing screen-right;
// the renderer flips scale.x for the other direction.

function pad(g: Graphics): void {
  g.rect(-42, -50, 84, 66).fill({ color: 0x000000, alpha: 0 });
}

function shadow(g: Graphics, rx: number): void {
  g.ellipse(0, 6, rx, 4.5).fill({ color: 0x000000, alpha: 0.28 });
}

function wheel(g: Graphics, x: number, y: number, r: number, frame: number): void {
  g.circle(x, y, r).fill(0x241c16).stroke({ width: 2, color: INK });
  g.circle(x, y, Math.max(2, r * 0.32)).fill(0xb08958).stroke({ width: 1.2, color: INK });
  const dx = frame === 0 ? 0 : r * 0.72;
  const dy = frame === 0 ? r * 0.82 : r * 0.4;
  g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy).stroke({ width: 1.5, color: 0xd7c4a0 });
  g.moveTo(x - dy, y + dx).lineTo(x + dy, y - dx).stroke({ width: 1.5, color: 0xd7c4a0 });
}

function legs(g: Graphics, frame: number, y0: number): void {
  if (frame === 0) {
    g.roundRect(-4, y0, 4.5, 12, 2).fill(PANTS).stroke({ width: 1.6, color: INK });
    g.roundRect(1.5, y0, 4.5, 12, 2).fill(0x2c2824).stroke({ width: 1.6, color: INK });
  } else {
    g.roundRect(-9, y0 + 2, 4.5, 10, 2).fill(PANTS).stroke({ width: 1.6, color: INK });
    g.roundRect(6, y0 - 1, 4.5, 13, 2).fill(0x2c2824).stroke({ width: 1.6, color: INK });
  }
}

function head(g: Graphics, x: number, y: number, r: number, dark: number, plume: boolean): void {
  g.circle(x, y, r).fill(SKIN).stroke({ width: 2, color: INK });
  g.poly([x - r * 0.7, y - r * 0.2, x + r * 0.9, y - r * 0.55, x + r * 0.7, y + r * 0.25, x - r * 0.6, y + r * 0.15])
    .fill(dark)
    .stroke({ width: 1.4, color: INK });
  if (plume) {
    g.poly([x - 1, y - r, x + 1, y - r - 9, x + 5, y - r + 1]).fill(0xc8a24a).stroke({ width: 1.3, color: INK });
  }
}

function markBack(g: Graphics, x: number, y: number, r: number, dark: number): void {
  g.circle(x, y, r).fill(dark).stroke({ width: 1.8, color: INK });
}

function drawPerson(
  g: Graphics,
  frame: number,
  col: number,
  light: number,
  dark: number,
  style: 'spear' | 'elite' | 'crossbow' | 'scout' | 'worker',
  back: boolean,
): void {
  const attack = frame === 2;
  const step = attack ? 0 : frame;
  const elite = style === 'elite';
  const reach = attack ? 8 : 0;
  shadow(g, elite ? 15 : 12);
  legs(g, step, elite ? -8 : -7);
  const bw = elite ? 16 : 13;
  const bh = elite ? 15 : 13;
  g.roundRect(-bw / 2, -18 - (elite ? 2 : 0), bw, bh, 4).fill(col).stroke({ width: 2.2, color: INK });
  g.roundRect(-2, -16, bw * 0.38, 5, 2).fill({ color: light, alpha: 0.95 });
  head(g, 2, elite ? -26 : -24, elite ? 6 : 5.2, dark, elite);

  if (style === 'spear') {
    g.circle(-8, -12, 5.2).fill(light).stroke({ width: 1.8, color: INK });
    g.circle(-8, -12, 1.6).fill(STEEL);
    g.moveTo(-2, -14).lineTo(18 + reach, -38).stroke({ width: 2.6, color: WOOD });
    g.poly([18 + reach, -38, 24 + reach, -40, 16 + reach, -32]).fill(STEEL).stroke({ width: 1.4, color: INK });
  } else if (style === 'elite') {
    g.moveTo(-4, -14).lineTo(16 + reach, -44).stroke({ width: 3, color: WOOD });
    g.poly([16 + reach, -44, 27 + reach, -42, 18 + reach, -36, 14 + reach, -40]).fill(STEEL).stroke({ width: 1.5, color: INK });
    g.poly([14 + reach, -40, 12 + reach, -32, 18 + reach, -36]).fill(STEEL).stroke({ width: 1.3, color: INK });
  } else if (style === 'crossbow') {
    g.roundRect(-6, -14, 16, 3.5, 1).fill(WOOD).stroke({ width: 1.4, color: INK });
    g.poly([-16, -12, -6, -20, 14, -20, 20, -12, 14, -16, -6, -16]).fill(WOOD).stroke({ width: 1.8, color: INK });
    g.moveTo(-14, -16).lineTo(18, -16).stroke({ width: 1.2, color: BONE });
    g.moveTo(8, -15).lineTo(24 + reach, -15).stroke({ width: 1.7, color: STEEL });
    g.roundRect(-12, -22, 4.5, 9, 1).fill(dark).stroke({ width: 1.3, color: INK });
  } else if (style === 'worker') {
    g.roundRect(4, -16, 14, 3, 1).fill(WOOD).stroke({ width: 1.3, color: INK });
    g.roundRect(14, -20, 5, 8, 1).fill(0x8a8e96).stroke({ width: 1.2, color: INK });
  } else {
    g.moveTo(2, -12).lineTo(14 + reach, -28).stroke({ width: 2, color: WOOD });
    g.poly([2, -20, 8, -24, 2, -16]).fill(light).stroke({ width: 1.2, color: INK });
  }
  if (back) markBack(g, 2, elite ? -26 : -24, elite ? 6.2 : 5.4, dark);
}

function drawCavalry(g: Graphics, frame: number, col: number, light: number, back: boolean): void {
  const coat = 0x8d5a32;
  const hoof = 0x4a3018;
  const attack = frame === 2;
  shadow(g, 18);
  const swap = frame === 1;
  // Legs start inside the belly so the stride never leaves them floating.
  g.roundRect(swap ? -15 : -11, -12, 4.5, 16, 2).fill(hoof).stroke({ width: 1.6, color: INK });
  g.roundRect(swap ? -6 : -15, -10, 4.5, 14, 2).fill(coat).stroke({ width: 1.6, color: INK });
  g.roundRect(swap ? 10 : 8, -12, 4.5, 16, 2).fill(hoof).stroke({ width: 1.6, color: INK });
  g.roundRect(swap ? 5 : 12, -9, 4.5, 13, 2).fill(coat).stroke({ width: 1.6, color: INK });
  g.moveTo(-14, -12).lineTo(-24, -4).lineTo(-20, 0).stroke({ width: 2.6, color: hoof });
  g.ellipse(0, -12, 16, 8).fill(coat).stroke({ width: 2.2, color: INK });
  g.roundRect(-7, -16, 13, 6, 2).fill(col).stroke({ width: 1.6, color: INK });
  g.ellipse(1, -15, 4, 2).fill({ color: light, alpha: 0.75 });
  g.poly([6, -14, 16, -24, 8, -10]).fill(coat).stroke({ width: 2, color: INK });
  g.ellipse(18, -24, 7, 4.2).fill(coat).stroke({ width: 2, color: INK });
  g.poly([13, -27, 15, -34, 19, -26]).fill(hoof).stroke({ width: 1.3, color: INK });
  g.circle(21, -24, 1.15).fill(INK);
  g.roundRect(-2, -28, 11, 14, 3).fill(col).stroke({ width: 1.8, color: INK });
  g.circle(5, -34, 4.6).fill(SKIN).stroke({ width: 1.7, color: INK });
  const tip = attack ? 8 : 0;
  g.moveTo(2, -24).lineTo(14 + tip, -40).stroke({ width: 2.2, color: WOOD });
  g.poly([14 + tip, -40, 20 + tip, -41, 12 + tip, -34]).fill(STEEL).stroke({ width: 1.2, color: INK });
  if (back) markBack(g, 5, -34, 4.8, hoof);
}

function drawWagon(
  g: Graphics,
  frame: number,
  col: number,
  light: number,
  style: 'chariot' | 'ram' | 'fix',
): void {
  shadow(g, style === 'ram' ? 20 : 16);
  wheel(g, style === 'ram' ? -8 : -12, 6, style === 'ram' ? 8 : 7, frame);
  wheel(g, style === 'ram' ? 10 : 12, 6, style === 'ram' ? 8 : 7, frame);
  if (style === 'ram') {
    g.roundRect(-18, -16, 30, 16, 3).fill(col).stroke({ width: 2.2, color: INK });
    g.roundRect(-14, -13, 16, 5, 2).fill({ color: light, alpha: 0.85 });
    g.poly([10, -12, 32, -7, 10, -2]).fill(WOOD).stroke({ width: 1.8, color: INK });
    g.poly([26, -9, 34, -7, 26, -5]).fill(STEEL).stroke({ width: 1.3, color: INK });
    g.circle(-6, -18, 3.6).fill(SKIN).stroke({ width: 1.4, color: INK });
  } else if (style === 'fix') {
    g.roundRect(-16, -12, 32, 14, 3).fill(0x6b5840).stroke({ width: 2, color: INK });
    g.roundRect(-8, -22, 16, 12, 2).fill(0xd7efe4).stroke({ width: 1.8, color: INK });
    g.moveTo(0, -20).lineTo(0, -12).stroke({ width: 2.4, color: 0x2f8f6b });
    g.moveTo(-4, -16).lineTo(4, -16).stroke({ width: 2.4, color: 0x2f8f6b });
  } else {
    g.roundRect(-18, -14, 34, 14, 3).fill(0x6b5840).stroke({ width: 2, color: INK });
    g.roundRect(-14, -30, 26, 18, 3).fill(col).stroke({ width: 2.2, color: INK });
    g.roundRect(-10, -26, 16, 6, 2).fill({ color: light, alpha: 0.9 });
    g.poly([8, -24, 16, -28, 20, -24, 14, -22]).fill(WOOD).stroke({ width: 1.4, color: INK });
    g.moveTo(10, -23).lineTo(22, -23).stroke({ width: 1.4, color: STEEL });
    g.circle(-4, -32, 3.4).fill(SKIN).stroke({ width: 1.4, color: INK });
  }
}

function drawGrain(g: Graphics, frame: number): void {
  shadow(g, 15);
  wheel(g, -10, 6, 6.5, frame);
  wheel(g, 11, 6, 6.5, frame);
  g.roundRect(-16, -12, 32, 14, 3).fill(0x8a7044).stroke({ width: 2.2, color: INK });
  g.ellipse(-6, -16, 6, 5).fill(0xc9a83f).stroke({ width: 1.5, color: INK });
  g.ellipse(3, -19, 6.5, 5.5).fill(0xe0c15a).stroke({ width: 1.5, color: INK });
  g.ellipse(10, -14, 5, 4.2).fill(0xb9973a).stroke({ width: 1.4, color: INK });
  g.circle(14, -8, 3.3).fill(SKIN).stroke({ width: 1.3, color: INK });
}

function drawFlag(g: Graphics, frame: number, col: number, light: number, dark: number, back: boolean): void {
  shadow(g, 14);
  legs(g, frame, -6);
  g.roundRect(-6, -16, 12, 14, 3).fill(col).stroke({ width: 2, color: INK });
  head(g, 2, -22, 4.6, dark, false);
  g.roundRect(-8, 4, 16, 6, 2).fill(0x6b5a3f).stroke({ width: 1.5, color: INK });
  g.moveTo(0, 6).lineTo(0, -42).stroke({ width: 3, color: 0x8a6f45 });
  const flag = frame === 0
    ? [0, -42, 24, -36, 20, -26, 0, -22]
    : [0, -42, 26, -30, 22, -18, 0, -20];
  g.poly(flag).fill(col).stroke({ width: 2, color: INK });
  g.poly(frame === 0 ? [6, -38, 16, -34, 14, -29, 6, -27] : [6, -36, 18, -30, 16, -24, 6, -26])
    .fill({ color: light, alpha: 0.9 });
  g.circle(0, -42, 3.4).fill(0xc8a24a).stroke({ width: 1.4, color: INK });
  if (back) markBack(g, 2, -22, 4.8, dark);
}

function drawUnit(kind: UnitKind, owner: number, frame: number, back: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const col = FACTION_COLOR[owner];
  const light = FACTION_LIGHT[owner];
  const dark = FACTION_DARK[owner];
  const step = frame === 0 ? 0 : 1;
  pad(g);

  switch (kind) {
    case 'mcv':
      drawFlag(g, step, col, light, dark, back);
      break;
    case 'scout':
      drawPerson(g, frame, col, light, dark, 'scout', back);
      break;
    case 'bingzu':
      drawPerson(g, frame, col, light, dark, 'spear', back);
      break;
    case 'qingqi':
      drawCavalry(g, frame, col, light, back);
      break;
    case 'gongjiang':
      drawPerson(g, frame, col, light, dark, 'worker', back);
      break;
    case 'han_caiguan':
      drawPerson(g, frame, col, light, dark, 'crossbow', back);
      break;
    case 'chu_zidi':
      drawPerson(g, frame, col, light, dark, 'elite', back);
      break;
    case 'zhanche':
      drawWagon(g, step, col, light, 'chariot');
      break;
    case 'zhuangche':
      drawWagon(g, step, col, light, 'ram');
      break;
    case 'weixiuche':
      drawWagon(g, step, col, light, 'fix');
      break;
    case 'grainCart':
      drawGrain(g, step);
      break;
  }

  c.addChild(g);
  return c;
}

// --------------------------------------------------------------- buildings

function drawWorks(kind: BuildingKind, owner: number): Container {
  const c = new Container();
  const g = new Graphics();
  const col = FACTION_COLOR[owner];
  const light = FACTION_LIGHT[owner];
  const dark = FACTION_DARK[owner];
  if (kind === 'nutai') {
    g.ellipse(0, 16, 22, 8).fill({ color: 0x000000, alpha: 0.28 });
    g.poly([-18, 4, 0, 16, 0, 34, -18, 22]).fill(dark).stroke({ width: 1.6, color: INK });
    g.poly([0, 16, 18, 4, 18, 22, 0, 34]).fill(col).stroke({ width: 1.6, color: INK });
    g.poly([0, -8, 18, 4, 0, 16, -18, 4]).fill(light).stroke({ width: 2, color: INK });
    g.moveTo(0, -8).lineTo(0, -22).stroke({ width: 2.4, color: WOOD });
    g.poly([-12, -18, 12, -18, 8, -24, -8, -24]).fill(WOOD).stroke({ width: 1.5, color: INK });
    g.moveTo(-10, -16).lineTo(14, -16).stroke({ width: 1.4, color: STEEL });
  } else {
    g.ellipse(0, 6, 18, 8).fill(0x1a120c).stroke({ width: 2, color: 0x4a3828 });
    g.ellipse(0, 5, 10, 4).fill(0x0c0908);
    g.moveTo(-12, 4).lineTo(-4, -8).stroke({ width: 2.2, color: WOOD });
    g.moveTo(12, 4).lineTo(4, -8).stroke({ width: 2.2, color: WOOD });
    g.moveTo(0, 6).lineTo(0, -6).stroke({ width: 2, color: WOOD });
  }
  c.addChild(g);
  return c;
}

/** 拒马按四向邻居拼墙。bit：1 北(-y) 2 东(+x) 4 南(+y) 8 西(-x)。 */
function drawJuma(mask: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.rect(-30, -24, 60, 48).fill({ color: 0x000000, alpha: 0 });
  const beams: Array<[number, number, number]> = [
    [1, 16, -8],
    [2, 16, 8],
    [4, -16, 8],
    [8, -16, -8],
  ];
  if (mask === 0) {
    g.ellipse(0, 8, 16, 5).fill({ color: 0x000000, alpha: 0.28 });
    g.moveTo(-14, 8).lineTo(14, -16).stroke({ width: 5, color: 0x4a3218 });
    g.moveTo(14, 8).lineTo(-14, -16).stroke({ width: 5, color: 0x4a3218 });
    g.moveTo(-14, 8).lineTo(14, -16).stroke({ width: 2.4, color: WOOD });
    g.moveTo(14, 8).lineTo(-14, -16).stroke({ width: 2.4, color: WOOD });
    g.circle(0, -4, 2.6).fill(STEEL).stroke({ width: 1.2, color: INK });
  } else {
    g.ellipse(0, 6, 12, 4).fill({ color: 0x000000, alpha: 0.28 });
    for (const [bit, hx, hy] of beams) {
      if ((mask & bit) === 0) continue;
      g.moveTo(0, 2).lineTo(hx, hy).stroke({ width: 8, color: 0x3a2814 });
      g.moveTo(0, 2).lineTo(hx, hy).stroke({ width: 4.5, color: WOOD });
    }
    g.roundRect(-5, -4, 10, 10, 2).fill(WOOD).stroke({ width: 1.6, color: INK });
    g.moveTo(-3, -2).lineTo(3, 4).stroke({ width: 1.4, color: STEEL });
  }
  c.addChild(g);
  return c;
}

function drawBuilding(kind: BuildingKind, owner: number): Container {
  if (kind === 'juma') return drawJuma(0);
  if (kind === 'nutai' || kind === 'xiankeng') return drawWorks(kind, owner);
  const def = BUILDING_DEFS[kind];
  const c = new Container();
  const g = new Graphics();
  const hw = ((def.w + def.h) * TILE_W) / 4;
  const hh = ((def.w + def.h) * TILE_H) / 4;
  const H = kind === 'daying' ? 40 : 28;
  const base = FACTION_COLOR[owner];
  const light = FACTION_LIGHT[owner];
  const dark = FACTION_DARK[owner];

  g.ellipse(0, hh * 0.55, hw * 0.98, hh * 0.62).fill({ color: 0x000000, alpha: 0.28 });

  // left wall
  g.poly([-hw, 0, 0, hh, 0, hh + H, -hw, H]).fill(dark).stroke({ width: 1.5, color: INK });
  // right wall
  g.poly([0, hh, hw, 0, hw, H, 0, hh + H]).fill(base).stroke({ width: 1.5, color: INK });
  // roof
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(light).stroke({ width: 2, color: INK });
  // inner roof line for a tiled look
  g.poly([0, -hh * 0.55, hw * 0.55, 0, 0, hh * 0.55, -hw * 0.55, 0])
    .fill({ color: light, alpha: 0.35 });

  if (kind === 'daying') {
    // banner pole
    g.moveTo(0, -hh).lineTo(0, -hh - 46).stroke({ width: 3, color: INK });
    g.poly([0, -hh - 46, 26, -hh - 38, 0, -hh - 30]).fill(base).stroke({ width: 1.5, color: INK });
  }

  c.addChild(g);
  return c;
}

function drawIcon(kind: UnitKind, owner: number): Container {
  const c = new Container();
  const g = new Graphics();
  const col = FACTION_COLOR[owner];
  g.circle(0, 0, 22).fill({ color: col, alpha: 0.18 }).stroke({ width: 2, color: col });
  switch (kind) {
    case 'mcv':
      g.moveTo(0, 8).lineTo(0, -14).stroke({ width: 2.5, color: 0x8a6f45 });
      g.poly([0, -14, 13, -11, 11, -5, 0, -2]).fill(col).stroke({ width: 1.5, color: INK });
      break;
    case 'scout':
      g.circle(0, 2, 6).fill(col).stroke({ width: 1.6, color: INK });
      g.moveTo(2, 0).lineTo(10, -12).stroke({ width: 1.8, color: WOOD });
      g.poly([2, -8, 7, -11, 2, -4]).fill(0xf2e8d5);
      break;
    case 'bingzu':
      g.circle(0, 2, 7).fill(col).stroke({ width: 1.8, color: INK });
      g.circle(0, -8, 4).fill(SKIN).stroke({ width: 1.4, color: INK });
      g.moveTo(-2, 0).lineTo(12, -14).stroke({ width: 2.2, color: WOOD });
      break;
    case 'qingqi':
      g.ellipse(-2, 2, 13, 6).fill(col).stroke({ width: 1.6, color: INK });
      g.circle(8, -6, 3.5).fill(SKIN).stroke({ width: 1.2, color: INK });
      break;
    case 'gongjiang':
      g.circle(0, 2, 6).fill(0xc4a574).stroke({ width: 1.6, color: INK });
      g.roundRect(4, -2, 10, 3, 1).fill(WOOD);
      break;
    case 'han_caiguan':
      g.circle(-2, 2, 6).fill(col).stroke({ width: 1.6, color: INK });
      g.poly([-10, 0, 10, -5, 10, -1, -10, 3]).fill(WOOD).stroke({ width: 1.3, color: INK });
      break;
    case 'chu_zidi':
      g.circle(0, 2, 8).fill(col).stroke({ width: 1.8, color: INK });
      g.circle(0, -9, 4.5).fill(SKIN).stroke({ width: 1.4, color: INK });
      g.moveTo(-2, -2).lineTo(10, -16).stroke({ width: 2.4, color: WOOD });
      g.poly([10, -16, 16, -14, 10, -10]).fill(STEEL).stroke({ width: 1.2, color: INK });
      break;
    case 'zhanche':
      g.roundRect(-13, -8, 26, 16, 2).fill(col).stroke({ width: 1.8, color: INK });
      g.circle(-8, 10, 4).fill(0x241c16);
      g.circle(8, 10, 4).fill(0x241c16);
      break;
    case 'zhuangche':
      g.roundRect(-14, -6, 22, 14, 2).fill(col).stroke({ width: 1.8, color: INK });
      g.poly([8, -4, 16, 1, 8, 6]).fill(WOOD).stroke({ width: 1.4, color: INK });
      break;
    case 'weixiuche':
      g.roundRect(-13, -6, 26, 14, 2).fill(0xd7efe4).stroke({ width: 1.6, color: INK });
      g.moveTo(0, -4).lineTo(0, 4).stroke({ width: 2, color: 0x2f8f6b });
      g.moveTo(-4, 0).lineTo(4, 0).stroke({ width: 2, color: 0x2f8f6b });
      break;
    case 'grainCart':
      g.roundRect(-13, -4, 26, 14, 2).fill(0x8a7a4a).stroke({ width: 1.8, color: INK });
      g.circle(0, -10, 5).fill(0xd9b84f);
      break;
  }
  c.addChild(g);
  return c;
}

// --------------------------------------------------------------- terrain

export const TERRAIN_COLOR = {
  grass: 0x4a6b3c,
  dirt: 0x7a6448,
  water: 0x27455f,
  rock: 0x555560,
  ore: 0xb59a3c,
};

export function buildTextures(renderer: PixiRenderer, unitKinds: UnitKind[], owner: number): TextureSet {
  const units = new Map<string, Baked>();
  const buildings = new Map<string, Baked>();
  const icons = new Map<string, Baked>();

  for (const side of [0, 1]) {
    for (const kind of unitKinds) {
      for (const back of [false, true]) {
        for (const frame of [0, 1, 2]) {
          const dir = back ? 'ne' : 'se';
          units.set(`${kind}:${side}:${dir}:${frame}`, bake(renderer, drawUnit(kind, side, frame, back)));
        }
      }
    }
  }
  for (const kind of Object.keys(BUILDING_DEFS) as BuildingKind[]) {
    if (kind === 'juma') {
      for (const side of [0, 1]) {
        for (let mask = 0; mask < 16; mask++) {
          buildings.set(`juma:${side}:${mask}`, bake(renderer, drawJuma(mask)));
        }
      }
      continue;
    }
    buildings.set(`${kind}:0`, bake(renderer, drawBuilding(kind, 0)));
    buildings.set(`${kind}:1`, bake(renderer, drawBuilding(kind, 1)));
  }
  for (const kind of unitKinds) {
    icons.set(kind, bake(renderer, drawIcon(kind, owner)));
  }

  return { units, buildings, icons };
}
