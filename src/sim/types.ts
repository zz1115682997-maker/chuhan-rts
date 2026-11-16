// Core shared types for the simulation. Kept free of TS-only runtime syntax so the
// simulation can also be executed headlessly by node's type stripping.

export type Faction = 'han' | 'chu';

export type UnitKind =
  | 'han_zu'
  | 'han_nuge'
  | 'han_wugang'
  | 'chu_zidi'
  | 'chu_qi'
  | 'chu_chongche'
  | 'grainCart';

export type BuildingKind = 'daying' | 'canglin' | 'bingying' | 'chemafang';

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
  cargo: number;
  harvestTimer: number;
  repathTimer: number;
  stuckTimer: number;
  lastX: number;
  lastY: number;
  alive: boolean;
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
  unitQueue: BuildItem[];
  buildingQueue: BuildItem[];
  readyBuilding: BuildingKind | null;
}

export type Command =
  | { c: 'move'; ids: number[]; x: number; y: number }
  | { c: 'attackMove'; ids: number[]; x: number; y: number }
  | { c: 'attackTarget'; ids: number[]; targetUnit: number; targetBuilding: number }
  | { c: 'stop'; ids: number[] }
  | { c: 'queueUnit'; kind: UnitKind }
  | { c: 'queueBuilding'; kind: BuildingKind }
  | { c: 'cancelUnit' }
  | { c: 'cancelBuilding' }
  | { c: 'placeBuilding'; kind: BuildingKind; tx: number; ty: number }
  | { c: 'setRally'; id: number; x: number; y: number };

export type SimEvent =
  | { t: 'shot'; x: number; y: number; tx: number; ty: number; owner: number; kind: Warhead }
  | { t: 'hit'; x: number; y: number; owner: number }
  | { t: 'die'; x: number; y: number; owner: number }
  | { t: 'built'; x: number; y: number; owner: number };
