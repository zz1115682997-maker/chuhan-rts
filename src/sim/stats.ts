// Static game data tables. All balance numbers live here — tuning means editing
// this file only, never the simulation code.

import type { Armor, BuildingKind, Faction, UnitKind, Warhead } from './types.js';

export interface WeaponDef {
  range: number;
  damage: number;
  cooldown: number;
  warhead: Warhead;
}

export interface UnitDef {
  kind: UnitKind;
  name: string;
  faction: Faction | 'neutral';
  cost: number;
  buildTime: number;
  hp: number;
  armor: Armor;
  speed: number;
  radius: number;
  sight: number;
  weapon: WeaponDef | null;
  isHarvester: boolean;
  cargoMax: number;
  from: BuildingKind;
  hotkey: string;
  desc: string;
}

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  cost: number;
  buildTime: number;
  hp: number;
  w: number;
  h: number;
  requires: BuildingKind | null;
  produces: 'infantry' | 'vehicle' | 'building' | null;
  hotkey: string;
  desc: string;
}

// ---- 汉军 (刘邦): 廉价量大、弩阵破甲、后劲足 ---------------------------------
// ---- 楚军 (项羽): 精锐、冲锋、机动，前期猛后期乏力 ---------------------------

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  mcv: {
    kind: 'mcv', name: '军旗', faction: 'neutral', cost: 0, buildTime: 0,
    hp: 700, armor: 'heavy', speed: 1.9, radius: 0.5, sight: 6,
    weapon: null, isHarvester: false, cargoMax: 0, from: 'daying', hotkey: 'F',
    desc: '帅旗开到何处，大营就立在何处。按 F 立旗扎营',
  },
  han_zu: {
    kind: 'han_zu', name: '汉卒', faction: 'han', cost: 150, buildTime: 3.5,
    hp: 130, armor: 'infantry', speed: 1.65, radius: 0.24, sight: 6,
    weapon: { range: 1.2, damage: 12, cooldown: 0.7, warhead: 'blade' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'Q',
    desc: '廉价长矛兵，数量取胜',
  },
  han_nuge: {
    kind: 'han_nuge', name: '材官弩', faction: 'han', cost: 300, buildTime: 5,
    hp: 90, armor: 'infantry', speed: 1.35, radius: 0.24, sight: 7,
    weapon: { range: 6, damage: 34, cooldown: 1.9, warhead: 'bolt' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'W',
    desc: '远程弩兵，破甲强，怕骑兵贴脸',
  },
  han_wugang: {
    kind: 'han_wugang', name: '武刚车', faction: 'han', cost: 900, buildTime: 8,
    hp: 750, armor: 'heavy', speed: 1.25, radius: 0.45, sight: 7,
    weapon: { range: 4.5, damage: 28, cooldown: 1.6, warhead: 'bolt' },
    isHarvester: false, cargoMax: 0, from: 'chemafang', hotkey: 'E',
    desc: '结阵战车，耐打、能打远处，慢',
  },
  chu_zidi: {
    kind: 'chu_zidi', name: '江东子弟', faction: 'chu', cost: 420, buildTime: 6,
    hp: 320, armor: 'infantry', speed: 1.45, radius: 0.26, sight: 6,
    weapon: { range: 1.3, damage: 26, cooldown: 0.85, warhead: 'blade' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'Q',
    desc: '精兵，攻高血厚，贵',
  },
  chu_qi: {
    kind: 'chu_qi', name: '楚骑', faction: 'chu', cost: 700, buildTime: 7,
    hp: 360, armor: 'light', speed: 3.1, radius: 0.34, sight: 7,
    weapon: { range: 1.5, damage: 34, cooldown: 1.0, warhead: 'charge' },
    isHarvester: false, cargoMax: 0, from: 'chemafang', hotkey: 'W',
    desc: '最快的兵，冲阵屠弩，怕结阵',
  },
  chu_chongche: {
    kind: 'chu_chongche', name: '冲车', faction: 'chu', cost: 1000, buildTime: 10,
    hp: 950, armor: 'heavy', speed: 1.15, radius: 0.5, sight: 5,
    weapon: { range: 1.6, damage: 58, cooldown: 2.4, warhead: 'charge' },
    isHarvester: false, cargoMax: 0, from: 'chemafang', hotkey: 'E',
    desc: '重甲冲车，撞碎步兵和建筑，极慢',
  },
  grainCart: {
    kind: 'grainCart', name: '粮车', faction: 'neutral', cost: 1200, buildTime: 10,
    hp: 600, armor: 'heavy', speed: 1.7, radius: 0.5, sight: 5,
    weapon: null, isHarvester: true, cargoMax: 400, from: 'chemafang', hotkey: 'F',
    desc: '往返农田与仓廪运粮',
  },
};

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  daying: {
    kind: 'daying', name: '大营', cost: 0, buildTime: 0, hp: 1500, w: 3, h: 3,
    requires: null, produces: 'building', hotkey: '', desc: '建造与指挥中心',
  },
  canglin: {
    kind: 'canglin', name: '仓廪', cost: 1500, buildTime: 10, hp: 900, w: 3, h: 2,
    requires: null, produces: null, hotkey: '1', desc: '收粮，粮车卸货点',
  },
  bingying: {
    kind: 'bingying', name: '兵营', cost: 500, buildTime: 6, hp: 800, w: 2, h: 2,
    requires: null, produces: 'infantry', hotkey: '2', desc: '训练步兵',
  },
  chemafang: {
    kind: 'chemafang', name: '车马坊', cost: 1800, buildTime: 12, hp: 1000, w: 3, h: 2,
    requires: 'bingying', produces: 'vehicle', hotkey: '3', desc: '造战车、骑兵、粮车',
  },
};

// warhead -> armor damage multiplier. This table is the rock-paper-scissors.
export const DAMAGE_TABLE: Record<Warhead, Record<Armor, number>> = {
  // 刀剑/长矛 — 杀步兵高效，打不动重甲
  blade: { infantry: 1.0, light: 0.85, heavy: 0.22, building: 0.12 },
  // 弩矢 — 破甲，是重甲的天敌，对人也不错
  bolt: { infantry: 0.9, light: 0.6, heavy: 0.85, building: 0.2 },
  // 冲锋 — 屠杀步兵，对轻甲强，怕结阵重甲
  charge: { infantry: 1.25, light: 0.9, heavy: 0.32, building: 0.25 },
  // 攻城 — 拆建筑
  siege: { infantry: 0.3, light: 0.5, heavy: 0.45, building: 1.0 },
};

export const HARVEST_RATE = 1.2;    // seconds per harvest tick
export const HARVEST_PER_TICK = 50; // cargo units gained per tick
export const GRAIN_VALUE = 2.5;     // credits per cargo unit delivered
export const START_CREDITS = 5000;
/** 出售已建成建筑时返还的造价比率（红警标准为 50%） */
export const SELL_RATIO = 0.5;

export const FACTION_NAMES: Record<Faction, string> = {
  han: '汉',
  chu: '楚',
};

export const FACTION_TRAITS: Record<Faction, string> = {
  han: '兵廉量多 · 弩阵破甲 · 后劲足',
  chu: '精锐骁勇 · 铁骑冲阵 · 前期猛',
};

/** Units a faction can train, in UI order. */
export function unitsOf(faction: Faction): UnitKind[] {
  const out: UnitKind[] = [];
  for (const k of Object.keys(UNIT_DEFS) as UnitKind[]) {
    const def = UNIT_DEFS[k];
    if (def.faction === faction) out.push(k);
  }
  return out;
}
