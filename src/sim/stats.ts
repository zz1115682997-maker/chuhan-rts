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
  /** 能靠近陷坑，停一会儿把它拆掉，自己还活着。 */
  scout?: boolean;
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
  /** 挡住寻路。陷坑不挡，人走上去才触发。 */
  blocks: boolean;
  /** 会被士兵主动当作攻击目标。陷坑不算。 */
  targetable: boolean;
  /** 敌方走进占地时受到的固定伤害，然后工事消失。0 表示不是陷阱。 */
  trapDamage: number;
  /** 受到攻击时的额外倍率。陷坑较脆，普通攻击打得掉。 */
  taken: number;
  weapon: WeaponDef | null;
  /** 以建筑中心为圆心的开图半径，单位是格。 */
  sight: number;
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
  scout: {
    kind: 'scout', name: '侦察兵', faction: 'neutral', cost: 120, buildTime: 4,
    hp: 70, armor: 'infantry', speed: 2.4, radius: 0.22, sight: 9,
    weapon: { range: 1.15, damage: 8, cooldown: 0.7, warhead: 'blade' },
    isHarvester: false, scout: true, cargoMax: 0, from: 'bingying', hotkey: 'Q',
    desc: '双方都有。跑得快、看得远。靠近陷坑拆掉，自己还活着',
  },
  bingzu: {
    kind: 'bingzu', name: '兵卒', faction: 'neutral', cost: 150, buildTime: 3.5,
    hp: 130, armor: 'infantry', speed: 1.65, radius: 0.24, sight: 6,
    weapon: { range: 1.2, damage: 12, cooldown: 0.7, warhead: 'blade' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'W',
    desc: '双方一样的普通步兵',
  },
  qingqi: {
    kind: 'qingqi', name: '轻骑兵', faction: 'neutral', cost: 260, buildTime: 6,
    hp: 190, armor: 'light', speed: 2.5, radius: 0.32, sight: 7,
    weapon: { range: 1.3, damage: 14, cooldown: 0.95, warhead: 'charge' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'E',
    desc: '双方一样。比兵卒快，冲散步兵，自己不耐打',
  },
  gongjiang: {
    kind: 'gongjiang', name: '工匠', faction: 'neutral', cost: 180, buildTime: 5,
    hp: 100, armor: 'infantry', speed: 1.4, radius: 0.24, sight: 6,
    weapon: null, isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'R',
    desc: '不打仗。选中后点自己的建筑，走过去把它修好',
  },
  han_caiguan: {
    kind: 'han_caiguan', name: '弓弩手', faction: 'han', cost: 380, buildTime: 6,
    hp: 95, armor: 'infantry', speed: 1.3, radius: 0.24, sight: 8,
    weapon: { range: 7.2, damage: 44, cooldown: 1.4, warhead: 'bolt' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'T',
    desc: '汉军特色，对应江东子弟。弓弩，人少而脆，别让人贴脸',
  },
  zhanche: {
    kind: 'zhanche', name: '战车', faction: 'neutral', cost: 900, buildTime: 8,
    hp: 750, armor: 'heavy', speed: 1.25, radius: 0.45, sight: 7,
    weapon: { range: 4.5, damage: 28, cooldown: 1.6, warhead: 'bolt' },
    isHarvester: false, cargoMax: 0, from: 'chemafang', hotkey: 'A',
    desc: '两边都能造。结阵战车，耐打，能打远处，慢',
  },
  chu_zidi: {
    kind: 'chu_zidi', name: '江东子弟', faction: 'chu', cost: 420, buildTime: 6,
    hp: 190, armor: 'infantry', speed: 1.28, radius: 0.26, sight: 6,
    weapon: { range: 1.3, damage: 28, cooldown: 0.85, warhead: 'blade' },
    isHarvester: false, cargoMax: 0, from: 'bingying', hotkey: 'Q',
    desc: '楚军特色，对应弓弩手。贴到脸上就占便宜，空地上会被弓弩消耗',
  },
  zhuangche: {
    kind: 'zhuangche', name: '撞城车', faction: 'neutral', cost: 1000, buildTime: 10,
    hp: 900, armor: 'heavy', speed: 1.1, radius: 0.5, sight: 5,
    weapon: { range: 1.6, damage: 46, cooldown: 2.4, warhead: 'charge' },
    isHarvester: false, cargoMax: 0, from: 'chemafang', hotkey: 'S',
    desc: '两边都能造。专门撞建筑，极慢',
  },
  weixiuche: {
    kind: 'weixiuche', name: '维修车', faction: 'neutral', cost: 700, buildTime: 8,
    hp: 480, armor: 'heavy', speed: 1.55, radius: 0.45, sight: 6,
    weapon: null, isHarvester: false, cargoMax: 0, from: 'chemafang', hotkey: 'D',
    desc: '两边都能造。点自己的兵或建筑，修得比工匠快',
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
    requires: null, produces: 'building', blocks: true, targetable: true, trapDamage: 0, taken: 1, weapon: null, sight: 9,
    hotkey: '', desc: '建造与指挥中心',
  },
  canglin: {
    kind: 'canglin', name: '仓廪', cost: 1500, buildTime: 10, hp: 900, w: 3, h: 2,
    requires: null, produces: null, blocks: true, targetable: true, trapDamage: 0, taken: 1, weapon: null, sight: 6,
    hotkey: '1', desc: '收粮，粮车卸货点',
  },
  bingying: {
    kind: 'bingying', name: '兵营', cost: 500, buildTime: 6, hp: 800, w: 2, h: 2,
    requires: null, produces: 'infantry', blocks: true, targetable: true, trapDamage: 0, taken: 1, weapon: null, sight: 6,
    hotkey: '2', desc: '训练步兵',
  },
  chemafang: {
    kind: 'chemafang', name: '车马坊', cost: 1800, buildTime: 12, hp: 1000, w: 3, h: 2,
    requires: 'bingying', produces: 'vehicle', blocks: true, targetable: true, trapDamage: 0, taken: 1, weapon: null, sight: 6,
    hotkey: '3', desc: '造战车、骑兵、粮车',
  },
  juma: {
    kind: 'juma', name: '拒马', cost: 200, buildTime: 5, hp: 380, w: 1, h: 1,
    requires: null, produces: null, blocks: true, targetable: true, trapDamage: 0, taken: 1, weapon: null, sight: 3,
    hotkey: '4', desc: '可连成围墙。放下来之后按住拖动，一排一起放下',
  },
  nutai: {
    kind: 'nutai', name: '弩台', cost: 800, buildTime: 10, hp: 640, w: 2, h: 2,
    requires: null, produces: null, blocks: true, targetable: true, trapDamage: 0,
    weapon: { range: 6.2, damage: 34, cooldown: 1.3, warhead: 'bolt' }, sight: 8, taken: 1,
    hotkey: '5', desc: '固定弩台，自动射击附近敌人',
  },
  xiankeng: {
    kind: 'xiankeng', name: '陷坑', cost: 120, buildTime: 3, hp: 50, w: 1, h: 1,
    requires: null, produces: null, blocks: false, targetable: true, trapDamage: 0, taken: 8, weapon: null, sight: 2,
    hotkey: '6', desc: '看得见。攻击可以打掉。侦察兵靠近拆掉，自己还活着',
  },
};

// warhead -> armor damage multiplier. This table is the rock-paper-scissors.
export const DAMAGE_TABLE: Record<Warhead, Record<Armor, number>> = {
  // 刀剑/长矛 — 杀步兵高效，打不动重甲
  blade: { infantry: 1.0, light: 0.85, heavy: 0.22, building: 0.3 },
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
/** 侦察兵贴着陷坑拆除所需的时间（秒）。拆完人还在。 */
export const DISARM_TIME = 1.2;
export const DISARM_RANGE = 1.35;
export const REPAIR_PER_SECOND = 40;
export const REPAIR_VEHICLE_PER_SECOND = 72;

export const FACTION_NAMES: Record<Faction, string> = {
  han: '汉',
  chu: '楚',
};

export const FACTION_TRAITS: Record<Faction, string> = {
  han: '兵卒为本 · 轻骑通用 · 弓弩手',
  chu: '兵卒为本 · 轻骑通用 · 江东子弟',
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
