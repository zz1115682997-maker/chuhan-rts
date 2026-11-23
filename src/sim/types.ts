// Core shared types for the simulation. Kept free of TS-only runtime syntax so the
// simulation can also be executed headlessly by node's type stripping.

export type Faction = 'han' | 'chu';

export type UnitKind =
  | 'mcv'
  | 'scout'
  | 'bingzu'
  | 'qingqi'
  | 'gongjiang'
  | 'han_caiguan'
  | 'chu_zidi'
  | 'zhanche'
  | 'zhuangche'
  | 'weixiuche'
  | 'grainCart';

export type BuildingKind = 'daying' | 'canglin' | 'bingying' | 'chemafang' | 'shuaita' | 'juma' | 'nutai' | 'xiankeng' | 'fengjiantai';

export type Armor = 'infantry' | 'light' | 'heavy' | 'building';
export type Warhead = 'blade' | 'bolt' | 'charge' | 'siege';

export type OrderKind = 'idle' | 'move' | 'attack' | 'harvest' | 'deliver';

export interface Vec {
  x: number;
  y: number;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  owner: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  order: OrderKind;
  path: Vec[];
  pathI: number;
  destX: number;
  destY: number;
  targetUnit: number;
  targetBuilding: number;
  cooldown: number;
  /** 侦察兵拆陷坑的已持续时间（秒）。 */
  disarm: number;
  cargo: number;
  harvestTimer: number;
  repathTimer: number;
  stuckTimer: number;
  lastX: number;
  lastY: number;
  alive: boolean;
  /** 引燃：剩余燃烧时间（秒）与每秒伤害，被烽火台喷到就会着火。 */
  burnTime: number;
  burnDps: number;
  /** 追加的路径点：走完当前目的地后依次前往 */
  waypoints: Vec[];
}

export interface Building {
  id: number;
  kind: BuildingKind;
  owner: number;
  tx: number;
  ty: number;
  x: number; // center in tile space
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  rallyX: number;
  rallyY: number;
  hasRally: boolean;
  targetUnit: number;
  targetBuilding: number;
  cooldown: number;
  alive: boolean;
}

export interface BuildItem {
  kind: UnitKind | BuildingKind;
  progress: number;
  cost: number;
  buildTime: number;
}

export interface PlayerState {
  id: number;
  faction: Faction;
  credits: number;
  /** 士兵栏正在排的，同时最多 99，造完就能再排。 */
  infantryQueue: BuildItem[];
  /** 车辆栏正在排的，同时最多 99。 */
  vehicleQueue: BuildItem[];
  buildingQueue: BuildItem[];
  readyBuilding: BuildingKind | null;
}

export type Command =
  | { c: 'move'; ids: number[]; x: number; y: number }
  | { c: 'attackMove'; ids: number[]; x: number; y: number }
  | { c: 'attackTarget'; ids: number[]; targetUnit: number; targetBuilding: number }
  | { c: 'stop'; ids: number[] }
  | { c: 'deploy'; ids: number[] }
  | { c: 'queueMove'; ids: number[]; x: number; y: number }
  | { c: 'sell'; id: number }
  | { c: 'queueUnit'; kind: UnitKind }
  | { c: 'queueBuilding'; kind: BuildingKind }
  | { c: 'cancelUnit'; lane: 'infantry' | 'vehicle' }
  | { c: 'cancelBuilding' }
  | { c: 'placeBuilding'; kind: BuildingKind; tx: number; ty: number }
  | { c: 'placeWall'; kind: BuildingKind; tiles: { x: number; y: number }[] }
  | { c: 'repair'; ids: number[]; building: number }
  | { c: 'repairUnit'; ids: number[]; target: number }
  | { c: 'setRally'; id: number; x: number; y: number };

export type SimEvent =
  | { t: 'shot'; x: number; y: number; tx: number; ty: number; owner: number; kind: Warhead }
  | { t: 'hit'; x: number; y: number; owner: number }
  | { t: 'die'; x: number; y: number; owner: number }
  | { t: 'built'; x: number; y: number; owner: number };
