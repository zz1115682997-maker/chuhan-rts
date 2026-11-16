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

function drawUnit(kind: UnitKind, owner: number): Container {
  const c = new Container();
  const g = new Graphics();
  const col = FACTION_COLOR[owner];
  const light = FACTION_LIGHT[owner];

  // ground shadow (keeps the sprite anchored visually to its tile)
  g.ellipse(0, 6, 14, 6).fill({ color: 0x000000, alpha: 0.3 });

  switch (kind) {
    case 'mcv': {
      // 基地车：方头卡车 + 折叠吊臂
      g.roundRect(-19, -15, 38, 21, 4).fill(0x6f7a58).stroke({ width: 2, color: INK });
      g.roundRect(2, -19, 17, 12, 3).fill(col).stroke({ width: 2, color: INK });
      g.moveTo(-10, -15).lineTo(-10, -33).lineTo(4, -26).stroke({ width: 3, color: 0xc8a24a });
      g.circle(-12, 7, 6).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      g.circle(-2, 7, 6).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      g.circle(11, 7, 6).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      break;
    }
    case 'han_zu':
    case 'chu_zidi': {
      const r = kind === 'chu_zidi' ? 9.5 : 7.5;
      g.moveTo(0, 4).lineTo(0, -22).stroke({ width: 2.5, color: BONE });
      g.circle(0, -2, r).fill(col).stroke({ width: 2, color: INK });
      g.circle(0, -8, r * 0.55).fill(light);
      if (kind === 'chu_zidi') {
        // halberd blade
        g.poly([0, -22, 7, -27, 0, -30]).fill(0xd9d9d9).stroke({ width: 1, color: INK });
      }
      break;
    }
    case 'han_nuge': {
      g.circle(0, -2, 7).fill(col).stroke({ width: 2, color: INK });
      g.moveTo(-9, -8).lineTo(9, -8).stroke({ width: 2.5, color: BONE });
      g.moveTo(-9, -8).lineTo(-6, -13).stroke({ width: 2, color: BONE });
      g.moveTo(9, -8).lineTo(6, -13).stroke({ width: 2, color: BONE });
      break;
    }
    case 'han_wugang': {
      g.roundRect(-15, -16, 30, 17, 3).fill(col).stroke({ width: 2, color: INK });
      g.roundRect(-11, -12, 22, 6, 2).fill(light);
      g.circle(-9, 4, 5).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      g.circle(9, 4, 5).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      break;
    }
    case 'chu_qi': {
      g.ellipse(0, -6, 16, 7).fill(col).stroke({ width: 2, color: INK });
      g.circle(11, -12, 5).fill(light).stroke({ width: 1.5, color: INK });
      g.moveTo(-14, -8).lineTo(-20, -14).stroke({ width: 2.5, color: BONE });
      break;
    }
    case 'chu_chongche': {
      g.roundRect(-17, -20, 34, 22, 3).fill(col).stroke({ width: 2, color: INK });
      g.poly([-17, -20, 17, -20, 0, -30]).fill(light).stroke({ width: 2, color: INK });
      g.circle(-11, 5, 6).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      g.circle(11, 5, 6).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      break;
    }
    case 'grainCart': {
      g.roundRect(-13, -14, 26, 16, 3).fill(0x8a7a4a).stroke({ width: 2, color: INK });
      g.circle(-6, -16, 5).fill(0xc9a83f);
      g.circle(2, -18, 5).fill(0xd9b84f);
      g.circle(8, -15, 4).fill(0xb9973a);
      g.circle(-9, 5, 5).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      g.circle(9, 5, 5).fill(0x2b2b2b).stroke({ width: 1.5, color: INK });
      break;
    }
  }

  c.addChild(g);
  return c;
}

// --------------------------------------------------------------- buildings

function drawBuilding(kind: BuildingKind, owner: number): Container {
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
      g.roundRect(-14, -10, 28, 20, 3).fill(0x6f7a58).stroke({ width: 2, color: INK });
      g.roundRect(0, -16, 13, 10, 2).fill(col).stroke({ width: 2, color: INK });
      break;
    case 'han_zu':
    case 'chu_zidi':
      g.circle(0, -2, 9).fill(col).stroke({ width: 2, color: INK });
      g.moveTo(0, 8).lineTo(0, -16).stroke({ width: 2.5, color: BONE });
      break;
    case 'han_nuge':
      g.circle(0, -2, 8).fill(col).stroke({ width: 2, color: INK });
      g.moveTo(-11, -6).lineTo(11, -6).stroke({ width: 2.5, color: BONE });
      break;
    case 'han_wugang':
    case 'chu_chongche':
      g.roundRect(-14, -11, 28, 20, 3).fill(col).stroke({ width: 2, color: INK });
      break;
    case 'chu_qi':
      g.ellipse(0, 0, 16, 8).fill(col).stroke({ width: 2, color: INK });
      break;
    case 'grainCart':
      g.roundRect(-13, -10, 26, 18, 3).fill(0x8a7a4a).stroke({ width: 2, color: INK });
      g.circle(0, -13, 6).fill(0xd9b84f);
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

  for (const kind of unitKinds) {
    units.set(`${kind}:${owner}`, bake(renderer, drawUnit(kind, owner)));
  }
  // both factions' units are pre-baked so captured/other units look right
  for (const kind of unitKinds) {
    units.set(`${kind}:${1 - owner}`, bake(renderer, drawUnit(kind, 1 - owner)));
  }
  for (const kind of Object.keys(BUILDING_DEFS) as BuildingKind[]) {
    buildings.set(`${kind}:0`, bake(renderer, drawBuilding(kind, 0)));
    buildings.set(`${kind}:1`, bake(renderer, drawBuilding(kind, 1)));
  }
  for (const kind of unitKinds) {
    icons.set(kind, bake(renderer, drawIcon(kind, owner)));
  }

  return { units, buildings, icons };
}
