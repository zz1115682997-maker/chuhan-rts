// The deterministic simulation core: fixed 20 Hz tick, no rendering, no DOM.
// Everything in here is pure data + integer/float math so it can run headless.

import { generateMap, PLAYER_BASE, AI_BASE, T_ROCK, T_WATER } from './map.js';
import type { GameMap, MapKind } from './map.js';
import { findPath, lineOfSight } from './path.js';
import { Rng } from './rng.js';
import {
  BUILDING_DEFS, UNIT_DEFS, DAMAGE_TABLE,
  HARVEST_RATE, HARVEST_PER_TICK, GRAIN_VALUE, START_CREDITS, SELL_RATIO, DISARM_TIME, DISARM_RANGE,
  REPAIR_PER_SECOND, REPAIR_VEHICLE_PER_SECOND,
} from './stats.js';
import type {
  Building, BuildingKind, BuildItem, Command, Faction, PlayerState, SimEvent, Unit, UnitKind, Vec,
} from './types.js';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
const GRID_CELL = 2;

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export class World {
  readonly map: GameMap;
  readonly rng: Rng;
  readonly players: PlayerState[];
  units: Unit[] = [];
  buildings: Building[] = [];
  unitById = new Map<number, Unit>();
  buildingById = new Map<number, Building>();
  tick = 0;
  state: 'playing' | 'won' | 'lost' = 'playing';
  events: SimEvent[] = [];
  /** 当前看得见的格子，按下标是玩家。1 = 亮。 */
  readonly visible: Uint8Array[];
  /** 曾经看见过的格子。离开后仍记着地形。 */
  readonly explored: Uint8Array[];

  private nextId = 1;
  private cmds: Command[] = [];
  private grid = new Map<number, Unit[]>();
  private scratch: Unit[] = [];
  private ai: AiHook | null = null;

  constructor(
    seed: number,
    playerFaction: Faction = 'han',
    aiFaction: Faction = 'chu',
    mapKind: MapKind = 'plains'
  ) {
    this.map = generateMap(mapKind, seed);
    this.rng = new Rng(seed ^ 0x5f3759df);
    this.players = [
      this.makePlayer(0, playerFaction),
      this.makePlayer(1, aiFaction),
    ];
    const cells = this.map.size * this.map.size;
    this.visible = [new Uint8Array(cells), new Uint8Array(cells)];
    this.explored = [new Uint8Array(cells), new Uint8Array(cells)];
    this.setupBase(0, PLAYER_BASE.x, PLAYER_BASE.y);
    this.setupBase(1, AI_BASE.x, AI_BASE.y);
    this.updateVision();
  }

  tileVisible(owner: number, x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.map.inBounds(tx, ty)) return false;
    return this.visible[owner][this.map.idx(tx, ty)] === 1;
  }

  tileExplored(owner: number, x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.map.inBounds(tx, ty)) return false;
    return this.explored[owner][this.map.idx(tx, ty)] === 1;
  }

  unitVisible(viewer: number, u: Unit): boolean {
    return u.owner === viewer || this.tileVisible(viewer, u.x, u.y);
  }

  buildingVisible(viewer: number, b: Building): boolean {
    if (b.owner === viewer) return true;
    // 陷坑埋在地下：敌人踩上去之前看不见，只有侦察兵能摸出来拆掉
    if (b.kind === 'xiankeng') return false;
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        if (this.tileVisible(viewer, x, y)) return true;
      }
    }
    return false;
  }

  attachAi(ai: AiHook): void {
    this.ai = ai;
  }

  enqueue(cmd: Command): void {
    this.cmds.push(cmd);
  }

  get gameSeconds(): number {
    return this.tick / TICK_RATE;
  }

  // ---------------------------------------------------------------- setup

  private makePlayer(id: number, faction: Faction): PlayerState {
    return {
      id, faction, credits: START_CREDITS,
      unitQueue: [], buildingQueue: [], readyBuilding: null,
    };
  }

  private setupBase(owner: number, cx: number, cy: number): void {
    // 开局只有一辆可移动的基地车，展开成大营之后才能开始建造
    const spot = this.findSpawnSpot(cx, cy, 2);
    if (spot) this.spawnUnit('mcv', owner, spot.x, spot.y);
  }

  /** 基地车展开：就地变成大营。位置放不下则失败。 */
  deployUnit(id: number): boolean {
    const u = this.unitById.get(id);
    if (!u || !u.alive || u.kind !== 'mcv') return false;
    const def = BUILDING_DEFS.daying;
    const tx = Math.round(u.x - def.w / 2);
    const ty = Math.round(u.y - def.h / 2);
    if (!this.map.blockRectFree(tx, ty, def.w, def.h)) return false;
    u.alive = false;
    this.unitById.delete(id);
    this.addBuildingAt('daying', u.owner, tx, ty);
    this.events.push({ t: 'built', x: u.x, y: u.y, owner: u.owner });
    return true;
  }

  /** 大营收起：变回一辆军旗车，原地腾出 3×3。不退还粮草。
   *  军旗车放在原大营的中心格，这样原地再立旗几乎必然成功（3×3 是刚腾出来的）。 */
  packYard(id: number): boolean {
    const b = this.buildingById.get(id);
    if (!b || !b.alive || b.owner !== 0 || b.kind !== 'daying') return false;
    const ctx = b.tx + Math.floor(b.w / 2);
    const cty = b.ty + Math.floor(b.h / 2);
    b.alive = false;
    this.map.clearOccupied(b.tx, b.ty, b.w, b.h);
    this.events.push({ t: 'die', x: b.x, y: b.y, owner: b.owner });
    const u = this.spawnUnit('mcv', b.owner, ctx + 0.5, cty + 0.5);
    if (!u) return false;
    this.events.push({ t: 'built', x: u.x, y: u.y, owner: b.owner });
    return true;
  }

  // ---------------------------------------------------------------- main loop

  step(): void {
    if (this.state !== 'playing') return;
    this.tick++;
    this.drainCommands();
    this.rebuildGrid();
    for (const u of this.units) {
      if (u.alive) this.updateUnit(u, DT);
    }
    this.resolveCollisions();
    this.updateDefenses();
    this.updateProduction();
    this.cleanup();
    this.checkVictory();
    this.updateVision();
    if (this.ai) this.ai.update(this);
  }

  /** 每个单位和建筑按视野开图。山岩和河水挡住视线，挡住的那一格本身仍看得见。 */
  private updateVision(): void {
    for (let owner = 0; owner < this.visible.length; owner++) this.visible[owner].fill(0);
    for (const u of this.units) {
      if (!u.alive) continue;
      this.reveal(u.owner, u.x, u.y, UNIT_DEFS[u.kind].sight);
    }
    for (const b of this.buildings) {
      if (!b.alive) continue;
      this.reveal(b.owner, b.x, b.y, BUILDING_DEFS[b.kind].sight);
    }
  }

  private reveal(owner: number, fx: number, fy: number, radius: number): void {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    const vis = this.visible[owner];
    const exp = this.explored[owner];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (!this.map.inBounds(x, y)) continue;
        if ((dx !== 0 || dy !== 0) && !this.sightReaches(x0, y0, x, y)) continue;
        const i = this.map.idx(x, y);
        vis[i] = 1;
        exp[i] = 1;
      }
    }
  }

  private sightReaches(x0: number, y0: number, x1: number, y1: number): boolean {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
      if (x === x1 && y === y1) return true;
      const t = this.map.terrainAt(x, y);
      if (t === T_WATER || t === T_ROCK) return false;
    }
  }

  // ---------------------------------------------------------------- commands

  private drainCommands(): void {
    const list = this.cmds;
    this.cmds = [];
    for (const c of list) this.execute(c);
  }

  private execute(c: Command): void {
    switch (c.c) {
      case 'move':
        this.issueMove(c.ids, c.x, c.y, false);
        break;
      case 'attackMove':
        this.issueMove(c.ids, c.x, c.y, true);
        break;
      case 'attackTarget':
        for (const id of c.ids) {
          const u = this.unitById.get(id);
          if (!u || !u.alive) continue;
          if (UNIT_DEFS[u.kind].isHarvester) continue;
          u.order = 'attack';
          u.targetUnit = c.targetUnit;
          u.targetBuilding = c.targetBuilding;
          u.destX = NaN;
          u.destY = NaN;
          u.path = [];
          u.pathI = 0;
          u.repathTimer = 0;
        }
        break;
      case 'stop':
        for (const id of c.ids) {
          const u = this.unitById.get(id);
          if (!u || !u.alive) continue;
          u.order = 'idle';
          u.path = [];
          u.pathI = 0;
          u.targetUnit = 0;
          u.targetBuilding = 0;
          u.destX = NaN;
          u.destY = NaN;
          u.waypoints.length = 0;
        }
        break;
      case 'deploy':
        for (const id of c.ids) this.deployUnit(id);
        break;
      case 'queueMove':
        this.queueMove(c.ids, c.x, c.y);
        break;
      case 'sell':
        this.sellBuilding(c.id);
        break;
      case 'queueUnit':
        this.queueUnit(0, c.kind);
        break;
      case 'queueBuilding':
        this.queueBuilding(0, c.kind);
        break;
      case 'cancelUnit': {
        const p = this.players[0];
        const it = p.unitQueue.pop();
        if (it) p.credits += it.cost;
        break;
      }
      case 'cancelBuilding': {
        const p = this.players[0];
        const it = p.buildingQueue.pop();
        if (it) {
          p.credits += it.cost;
        } else if (p.readyBuilding) {
          // 已造好但还没落地：取消并全额退款
          p.credits += BUILDING_DEFS[p.readyBuilding].cost;
          p.readyBuilding = null;
        }
        break;
      }
      case 'placeBuilding':
        this.tryPlaceBuilding(0, c.kind, c.tx, c.ty);
        break;
      case 'placeWall':
        this.placeWall(0, c.kind, c.tiles);
        break;
      case 'repair':
        this.orderRepair(c.ids, c.building);
        break;
      case 'repairUnit':
        this.orderRepairUnit(c.ids, c.target);
        break;
      case 'setRally': {
        const b = this.buildingById.get(c.id);
        if (b && b.owner === 0) {
          b.rallyX = c.x;
          b.rallyY = c.y;
          b.hasRally = true;
        }
        break;
      }
    }
  }

  private issueMove(ids: number[], x: number, y: number, attack: boolean): void {
    const list: Unit[] = [];
    for (const id of ids) {
      const u = this.unitById.get(id);
      if (u && u.alive) list.push(u);
    }
    const n = list.length;
    if (n === 0) return;
    const cols = Math.max(1, Math.round(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const u = list[i];
      const gx = x + ((i % cols) - (cols - 1) / 2) * 0.95;
      const gy = y + (Math.floor(i / cols) - (rows - 1) / 2) * 0.95;
      u.waypoints.length = 0;
      if (attack) {
        u.destX = gx;
        u.destY = gy;
        u.order = 'attack';
        u.targetUnit = 0;
        u.targetBuilding = 0;
        u.path = [];
        u.pathI = 0;
        u.repathTimer = 0;
      } else {
        this.startMove(u, gx, gy);
      }
    }
  }

  /** 开始走向一个点（会清空原有路径，但不清空路径点队列）。 */
  private startMove(u: Unit, x: number, y: number): void {
    u.destX = x;
    u.destY = y;
    u.order = 'move';
    u.targetUnit = 0;
    u.targetBuilding = 0;
    u.path = [];
    u.pathI = 0;
    u.repathTimer = 0;
    const from = this.map.nearestPassable(Math.floor(u.x), Math.floor(u.y), 4);
    const to = this.map.nearestPassable(Math.floor(x), Math.floor(y), 10);
    if (from && to) {
      const p = findPath(this.map, from.x, from.y, to.x, to.y);
      if (p) {
        u.path = p;
        u.pathI = 0;
      }
    }
  }

  /** Shift + 点击：给正在移动的单位追加一个路径点。 */
  private queueMove(ids: number[], x: number, y: number): void {
    for (const id of ids) {
      const u = this.unitById.get(id);
      if (!u || !u.alive) continue;
      if (u.order === 'move') {
        u.waypoints.push({ x, y });
      } else {
        u.waypoints.length = 0;
        this.startMove(u, x, y);
      }
    }
  }

  /** 出售已建成的建筑，按比例返还粮草。 */
  sellBuilding(id: number): boolean {
    const b = this.buildingById.get(id);
    if (!b || !b.alive || b.owner !== 0) return false;
    // 大营不是"卖"，是"收起"：变回军旗车，粮草不退，否则等于白拿钱又拿车
    if (b.kind === 'daying') return this.packYard(id);
    const def = BUILDING_DEFS[b.kind];
    this.players[b.owner].credits += Math.round(def.cost * SELL_RATIO);
    b.alive = false;
    this.map.clearOccupied(b.tx, b.ty, b.w, b.h);
    this.events.push({ t: 'die', x: b.x, y: b.y, owner: b.owner });
    return true;
  }

  // ---------------------------------------------------------------- production

  queueUnit(owner: number, kind: UnitKind): boolean {
    const p = this.players[owner];
    const def = UNIT_DEFS[kind];
    if (p.credits < def.cost) return false;
    if (!this.findProducer(owner, kind)) return false;
    p.credits -= def.cost;
    p.unitQueue.push({ kind, progress: 0, cost: def.cost, buildTime: def.buildTime });
    return true;
  }

  queueBuilding(owner: number, kind: BuildingKind): boolean {
    const p = this.players[owner];
    const def = BUILDING_DEFS[kind];
    if (p.credits < def.cost) return false;
    if (p.readyBuilding) return false;
    if (!this.hasBuilding(owner, 'daying')) return false;
    if (def.requires && !this.hasBuilding(owner, def.requires)) return false;
    p.credits -= def.cost;
    p.buildingQueue.push({ kind, progress: 0, cost: def.cost, buildTime: def.buildTime });
    return true;
  }

  private updateProduction(): void {
    for (const p of this.players) {
      this.tickPlayerProduction(p);
    }
  }

  private tickPlayerProduction(p: PlayerState): void {
    if (p.buildingQueue.length > 0 && !p.readyBuilding && this.hasBuilding(p.id, 'daying')) {
      const item = p.buildingQueue[0];
      item.progress += DT;
      if (item.progress >= item.buildTime) {
        p.readyBuilding = item.kind as BuildingKind;
        p.buildingQueue.shift();
      }
    }

    if (p.unitQueue.length > 0) {
      const item = p.unitQueue[0];
      const kind = item.kind as UnitKind;
      const producer = this.findProducer(p.id, kind);
      if (producer) {
        item.progress += DT;
        if (item.progress >= item.buildTime) {
          const spot = this.findSpawnSpot(producer.x, producer.y, 4);
          if (spot) {
            p.unitQueue.shift();
            const u = this.spawnUnit(kind, p.id, spot.x, spot.y);
            if (u && producer.hasRally) {
              this.enqueue({
                c: 'move', ids: [u.id], x: producer.rallyX, y: producer.rallyY,
              });
            }
          }
        }
      }
    }
  }

  findProducer(owner: number, kind: UnitKind): Building | null {
    const want = UNIT_DEFS[kind].from;
    for (const b of this.buildings) {
      if (b.alive && b.owner === owner && b.kind === want) return b;
    }
    return null;
  }

  hasBuilding(owner: number, kind: BuildingKind): boolean {
    for (const b of this.buildings) {
      if (b.alive && b.owner === owner && b.kind === kind) return true;
    }
    return false;
  }

  tryPlaceBuilding(owner: number, kind: BuildingKind, tx: number, ty: number): boolean {
    const p = this.players[owner];
    const def = BUILDING_DEFS[kind];
    if (!this.footprintFree(tx, ty, def.w, def.h)) return false;
    if (!this.nearOwnBase(owner, tx + def.w / 2, ty + def.h / 2, 9)) return false;
    if (p.readyBuilding !== kind) return false;
    this.addBuildingAt(kind, owner, tx, ty);
    p.readyBuilding = null;
    // 仓廪落成时附赠一辆粮车
    this.events.push({ t: 'built', x: tx + def.w / 2, y: ty + def.h / 2, owner });
    if (kind === 'canglin') {
      const spot = this.findSpawnSpot(tx + def.w / 2, ty + def.h / 2, 3);
      if (spot) this.spawnUnit('grainCart', owner, spot.x, spot.y);
    }
    return true;
  }

  /** 拒马连成一排。第一段用掉已经造好的那一座，后面的按造价现扣。 */
  placeWall(owner: number, kind: BuildingKind, tiles: { x: number; y: number }[]): number {
    const def = BUILDING_DEFS[kind];
    const p = this.players[owner];
    let placed = 0;
    for (const t of tiles) {
      if (placed >= 20) break;
      if (p.readyBuilding === kind) {
        if (!this.tryPlaceBuilding(owner, kind, t.x, t.y)) break;
        placed++;
        continue;
      }
      if (p.credits < def.cost) break;
      if (!this.hasBuilding(owner, 'daying')) break;
      if (!this.footprintFree(t.x, t.y, def.w, def.h)) break;
      if (!this.nearOwnBase(owner, t.x + def.w / 2, t.y + def.h / 2, 9)) break;
      p.credits -= def.cost;
      this.addBuildingAt(kind, owner, t.x, t.y);
      this.events.push({ t: 'built', x: t.x + def.w / 2, y: t.y + def.h / 2, owner });
      placed++;
    }
    return placed;
  }

  nearOwnBase(owner: number, x: number, y: number, radius: number): boolean {
    const r2 = radius * radius;
    for (const b of this.buildings) {
      if (!b.alive || b.owner !== owner) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  /** Spiral search for a legal building footprint near (cx, cy). */
  findPlacement(kind: BuildingKind, owner: number, cx: number, cy: number, radius: number): Vec | null {
    const def = BUILDING_DEFS[kind];
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = Math.round(cx - def.w / 2 + dx);
          const ty = Math.round(cy - def.h / 2 + dy);
          if (this.footprintFree(tx, ty, def.w, def.h) && this.nearOwnBase(owner, tx + def.w / 2, ty + def.h / 2, 9)) {
            return { x: tx, y: ty };
          }
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- entities

  addBuildingAt(kind: BuildingKind, owner: number, tx: number, ty: number): Building {
    const def = BUILDING_DEFS[kind];
    const b: Building = {
      id: this.nextId++, kind, owner, tx, ty,
      x: tx + def.w / 2, y: ty + def.h / 2, w: def.w, h: def.h,
      hp: def.hp, maxHp: def.hp,
      rallyX: 0, rallyY: 0, hasRally: false,
      targetUnit: 0, targetBuilding: 0, cooldown: 0, alive: true,
    };
    if (def.blocks) this.map.setOccupied(tx, ty, def.w, def.h, b.id);
    this.buildings.push(b);
    this.buildingById.set(b.id, b);
    return b;
  }

  spawnUnit(kind: UnitKind, owner: number, x: number, y: number): Unit {
    const def = UNIT_DEFS[kind];
    const u: Unit = {
      id: this.nextId++, kind, owner, x, y,
      hp: def.hp, maxHp: def.hp,
      facing: owner === 0 ? Math.PI * 0.25 : Math.PI * 1.25,
      order: 'idle', path: [], pathI: 0,
      destX: NaN, destY: NaN,
      targetUnit: 0, targetBuilding: 0, cooldown: 0, disarm: 0,
      cargo: 0, harvestTimer: 0, repathTimer: 0, stuckTimer: 0,
      lastX: x, lastY: y, alive: true, burnTime: 0, burnDps: 0, waypoints: [],
    };
    this.units.push(u);
    this.unitById.set(u.id, u);
    return u;
  }

  findSpawnSpot(cx: number, cy: number, radius: number): Vec | null {
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    for (let r = 1; r <= radius + 4; r++) {
      const cands: Vec[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = bx + dx;
          const y = by + dy;
          if (!this.map.passable(x, y)) continue;
          let taken = false;
          for (const u of this.units) {
            if (Math.abs(u.x - (x + 0.5)) < 0.6 && Math.abs(u.y - (y + 0.5)) < 0.6) {
              taken = true;
              break;
            }
          }
          if (!taken) cands.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
      if (cands.length > 0) return cands[this.rng.int(cands.length)];
    }
    return null;
  }

  // ---------------------------------------------------------------- unit update

  private updateUnit(u: Unit, dt: number): void {
    const def = UNIT_DEFS[u.kind];
    // 引燃：着火期间持续掉血，烧完自动熄
    if (u.burnTime > 0) {
      u.burnTime -= dt;
      u.hp -= u.burnDps * dt;
      if (u.hp <= 0) {
        u.alive = false;
        this.events.push({ t: 'die', x: u.x, y: u.y, owner: u.owner });
        return;
      }
    }
    if (u.cooldown > 0) u.cooldown -= dt;
    if ((u.kind === 'gongjiang' || u.kind === 'weixiuche') && this.updateRepair(u, dt)) return;

    if (def.isHarvester) {
      // an explicit move order overrides the harvest loop until it finishes
      if (u.order === 'move') {
        if (this.followPath(u, dt)) {
          u.order = 'harvest';
          u.path = [];
        }
        return;
      }
      this.updateHarvester(u, dt);
      return;
    }

    if (u.targetUnit !== 0) {
      const t = this.unitById.get(u.targetUnit);
      if (!t || !t.alive) u.targetUnit = 0;
    }
    if (u.targetBuilding !== 0) {
      const b = this.buildingById.get(u.targetBuilding);
      if (!b || !b.alive) u.targetBuilding = 0;
    }

    if (u.order === 'attack') {
      this.updateAttack(u, dt);
    } else if (u.order === 'move') {
      if (this.followPath(u, dt)) {
        const next = u.waypoints.shift();
        if (next) {
          this.startMove(u, next.x, next.y);
        } else {
          u.order = 'idle';
          u.path = [];
          u.pathI = 0;
        }
      }
    } else {
      if (UNIT_DEFS[u.kind].scout && u.order === 'idle') this.seekPit(u);
      if (u.order === 'idle') this.acquireIfIdle(u);
    }

    if (!this.channelDisarm(u, dt)) this.tryFire(u);
  }

  private orderRepair(ids: number[], building: number): void {
    const b = this.buildingById.get(building);
    if (!b || !b.alive) return;
    for (const id of ids) {
      const u = this.unitById.get(id);
      if (!u || !u.alive || u.owner !== b.owner) continue;
      if (u.kind !== 'gongjiang' && u.kind !== 'weixiuche') continue;
      u.targetBuilding = building;
      u.targetUnit = 0;
      u.order = 'move';
      u.path = [];
      u.pathI = 0;
      u.waypoints.length = 0;
    }
  }

  /** 工匠修建筑，维修车修建筑或友军。没有修理任务时返回 false。 */
  private updateRepair(u: Unit, dt: number): boolean {
    if (u.kind === 'weixiuche' && u.targetUnit !== 0 && u.targetBuilding === 0) {
      return this.healUnit(u, dt);
    }
    if (u.targetBuilding === 0) return false;
    const b = this.buildingById.get(u.targetBuilding);
    if (!b || !b.alive || b.owner !== u.owner) {
      u.targetBuilding = 0;
      return false;
    }
    if (b.hp >= b.maxHp) {
      u.targetBuilding = 0;
      u.order = 'idle';
      u.path = [];
      return true;
    }
    const rate = u.kind === 'weixiuche' ? REPAIR_VEHICLE_PER_SECOND : REPAIR_PER_SECOND;
    // 用「到建筑矩形最近点的距离」判定，而不是到中心的距离：
    // 3 格宽的建筑中心离最近可站立格有 2.0 格，用 1.7 格的阈值永远够不到。
    const nx = Math.min(Math.max(u.x, b.tx), b.tx + b.w);
    const ny = Math.min(Math.max(u.y, b.ty), b.ty + b.h);
    const dist = Math.hypot(nx - u.x, ny - u.y);
    if (dist > 1.2) {
      this.stepToward(u, nx, ny, 1.15, dt);
    } else {
      b.hp = Math.min(b.maxHp, b.hp + rate * dt);
    }
    return true;
  }

  private healUnit(u: Unit, dt: number): boolean {
    const t = this.unitById.get(u.targetUnit);
    if (!t || !t.alive || t.owner !== u.owner || t.id === u.id) {
      u.targetUnit = 0;
      return false;
    }
    if (t.hp >= t.maxHp) {
      u.targetUnit = 0;
      u.order = 'idle';
      return true;
    }
    this.stepToward(u, t.x, t.y, 1.5, dt);
    if (Math.hypot(t.x - u.x, t.y - u.y) <= 1.5) {
      t.hp = Math.min(t.maxHp, t.hp + REPAIR_VEHICLE_PER_SECOND * dt);
    }
    return true;
  }

  private stepToward(u: Unit, x: number, y: number, reach: number, dt: number): void {
    const dx = x - u.x;
    const dy = y - u.y;
    const dist = Math.hypot(dx, dy);
    u.facing = Math.atan2(dy, dx);
    if (dist <= reach || dist <= 0.02) return;
    const step = UNIT_DEFS[u.kind].speed * dt;
    const scale = Math.min(step, dist - reach) / dist;
    u.x += dx * Math.max(0, scale);
    u.y += dy * Math.max(0, scale);
  }

  private orderRepairUnit(ids: number[], target: number): void {
    const t = this.unitById.get(target);
    if (!t || !t.alive) return;
    for (const id of ids) {
      const u = this.unitById.get(id);
      if (!u || !u.alive || u.kind !== 'weixiuche' || u.owner !== t.owner || u.id === t.id) continue;
      u.targetUnit = target;
      u.targetBuilding = 0;
      u.order = 'move';
      u.path = [];
      u.pathI = 0;
      u.waypoints.length = 0;
    }
  }

  /** 空闲的侦察兵会自己走向视野里的敌方陷坑。 */
  private seekPit(u: Unit): void {
    const def = UNIT_DEFS[u.kind];
    let best = 0;
    let bestD = def.sight * def.sight;
    for (const b of this.buildings) {
      if (!b.alive || b.owner === u.owner || b.kind !== 'xiankeng') continue;
      const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b.id;
      }
    }
    if (best === 0) return;
    u.order = 'attack';
    u.targetBuilding = best;
    u.targetUnit = 0;
    u.destX = NaN;
    u.destY = NaN;
  }

  /** 侦察兵贴着陷坑停留一会儿，坑消失，人还在。返回 true 表示这一拍不再普攻。 */
  private channelDisarm(u: Unit, dt: number): boolean {
    if (!UNIT_DEFS[u.kind].scout || u.targetBuilding === 0) {
      u.disarm = 0;
      return false;
    }
    const b = this.buildingById.get(u.targetBuilding);
    if (!b || !b.alive || b.kind !== 'xiankeng' || b.owner === u.owner) {
      u.disarm = 0;
      return false;
    }
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d > DISARM_RANGE) {
      u.disarm = 0;
      return false;
    }
    u.disarm += dt;
    u.facing = Math.atan2(b.y - u.y, b.x - u.x);
    if (u.disarm >= DISARM_TIME) {
      b.alive = false;
      this.events.push({ t: 'die', x: b.x, y: b.y, owner: b.owner });
      u.disarm = 0;
      u.targetBuilding = 0;
      u.order = 'idle';
      u.path = [];
    }
    return true;
  }

  /** 建筑矩形上离单位最近的点（纯几何，不判视线），用于"走过去"的逼近目标 */
  private rectNear(u: { x: number; y: number }, b: Building): Vec {
    return {
      x: Math.min(Math.max(u.x, b.tx), b.tx + b.w),
      y: Math.min(Math.max(u.y, b.ty), b.ty + b.h),
    };
  }

  private updateAttack(u: Unit, dt: number): void {
    const def = UNIT_DEFS[u.kind];
    const tp0 = this.targetPos(u);
    if (tp0) {
      const bb = u.targetBuilding !== 0 ? this.buildingById.get(u.targetBuilding) : null;
      const tp = bb ? this.rectNear(u, bb) : tp0;
      const d = Math.hypot(tp.x - u.x, tp.y - u.y);
      const pit = u.targetBuilding !== 0 && this.buildingById.get(u.targetBuilding)?.kind === 'xiankeng';
      const range = def.scout && pit ? DISARM_RANGE : def.weapon ? def.weapon.range : 1;
      if (d > range * 0.9) {
        this.moveTo(u, tp.x, tp.y, dt);
      } else {
        u.path = [];
        u.pathI = 0;
        u.facing = Math.atan2(tp.y - u.y, tp.x - u.x);
      }
      return;
    }
    if (!Number.isNaN(u.destX)) {
      if (Math.hypot(u.destX - u.x, u.destY - u.y) < 0.9) {
        u.order = 'idle';
        u.destX = NaN;
        u.destY = NaN;
        return;
      }
      this.moveTo(u, u.destX, u.destY, dt);
      this.acquireIfIdle(u);
      return;
    }
    u.order = 'idle';
  }

  private targetPos(u: Unit): Vec | null {
    if (u.targetUnit !== 0) {
      const t = this.unitById.get(u.targetUnit);
      if (t && t.alive) return { x: t.x, y: t.y };
    }
    if (u.targetBuilding !== 0) {
      const b = this.buildingById.get(u.targetBuilding);
      if (b && b.alive) return { x: b.x, y: b.y };
    }
    return null;
  }

  private moveTo(u: Unit, tx: number, ty: number, dt: number): void {
    u.repathTimer -= dt;
    const atEnd = u.pathI >= u.path.length;
    if (atEnd || u.repathTimer <= 0) {
      u.repathTimer = 0.6;
      const from = this.map.nearestPassable(Math.floor(u.x), Math.floor(u.y), 3);
      const to = this.map.nearestPassable(Math.floor(tx), Math.floor(ty), 10);
      if (from && to) {
        const p = findPath(this.map, from.x, from.y, to.x, to.y);
        if (p !== null) {
          u.path = p;
          u.pathI = 0;
        }
      }
    }
    this.followPath(u, dt);
  }

  private followPath(u: Unit, dt: number): boolean {
    if (u.pathI >= u.path.length) return true;
    const def = UNIT_DEFS[u.kind];
    const wp = u.path[u.pathI];
    const dx = wp.x - u.x;
    const dy = wp.y - u.y;
    const d = Math.hypot(dx, dy);
    const step = def.speed * dt;
    if (d <= step || d < 0.02) {
      u.x = wp.x;
      u.y = wp.y;
      u.pathI++;
      return u.pathI >= u.path.length;
    }
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    u.facing = Math.atan2(dy, dx);
    return false;
  }

  private acquireIfIdle(u: Unit): void {
    if (u.targetUnit !== 0 || u.targetBuilding !== 0) return;
    const def = UNIT_DEFS[u.kind];
    if (!def.weapon) return;
    let bestUnit = 0;
    let bestD = def.sight * def.sight;
    for (const o of this.units) {
      if (!o.alive || o.owner === u.owner) continue;
      const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestUnit = o.id;
      }
    }
    if (bestUnit !== 0) {
      u.targetUnit = bestUnit;
      return;
    }
    let bestB = 0;
    let bestDB = def.sight * def.sight;
    for (const b of this.buildings) {
      if (!b.alive || b.owner === u.owner || !BUILDING_DEFS[b.kind].targetable) continue;
      if (b.kind === 'xiankeng') continue;
      const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
      if (d < bestDB) {
        bestDB = d;
        bestB = b.id;
      }
    }
    if (bestB !== 0) u.targetBuilding = bestB;
  }

  /**
   * 建筑自己占着格子，瞄准它的"矩形最近边"经常是内部不可走格，视线会误判成被墙挡住。
   * 所以对外开火统一找它外围一圈可走格中最近、且看得见的那个点。
   */
  private visionEdge(t: Building, fromX: number, fromY: number): Vec | null {
    let best: Vec | null = null;
    let bestD = Infinity;
    const fx = Math.floor(fromX);
    const fy = Math.floor(fromY);
    for (let y = t.ty - 1; y <= t.ty + t.h; y++) {
      for (let x = t.tx - 1; x <= t.tx + t.w; x++) {
        const inside = x >= t.tx && x < t.tx + t.w && y >= t.ty && y < t.ty + t.h;
        if (inside || !this.map.passable(x, y)) continue;
        if (!lineOfSight(this.map, fx, fy, x, y)) continue;
        const d = (x + 0.5 - fromX) ** 2 + (y + 0.5 - fromY) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return best;
  }

  private tryFire(u: Unit): void {
    const def = UNIT_DEFS[u.kind];
    if (!def.weapon || u.cooldown > 0) return;
    const tp0 = this.targetPos(u);
    if (!tp0) return;
    let tp = tp0;
    let losOk = false;
    if (u.targetBuilding !== 0) {
      const bb = this.buildingById.get(u.targetBuilding);
      if (!bb) return;
      const edge = this.visionEdge(bb, u.x, u.y);
      if (!edge) return;
      tp = edge;
      losOk = true;
    }
    const d = Math.hypot(tp.x - u.x, tp.y - u.y);
    if (d > def.weapon.range) return;
    if (!losOk && !lineOfSight(this.map, Math.floor(u.x), Math.floor(u.y), Math.floor(tp.x), Math.floor(tp.y))) return;
    u.cooldown = def.weapon.cooldown;
    u.facing = Math.atan2(tp.y - u.y, tp.x - u.x);
    this.events.push({ t: 'shot', x: u.x, y: u.y, tx: tp.x, ty: tp.y, owner: u.owner, kind: def.weapon.warhead });
    if (u.targetUnit !== 0) this.damageUnit(u.targetUnit, def.weapon.damage, def.weapon.warhead);
    else if (u.targetBuilding !== 0) this.damageBuilding(u.targetBuilding, def.weapon.damage, def.weapon.warhead);
  }

  damageUnit(id: number, dmg: number, warhead: keyof typeof DAMAGE_TABLE): void {
    const t = this.unitById.get(id);
    if (!t || !t.alive) return;
    const mult = DAMAGE_TABLE[warhead][UNIT_DEFS[t.kind].armor];
    t.hp -= dmg * mult;
    this.events.push({ t: 'hit', x: t.x, y: t.y, owner: t.owner });
    if (t.hp <= 0) {
      t.alive = false;
      this.events.push({ t: 'die', x: t.x, y: t.y, owner: t.owner });
    }
  }

  damageBuilding(id: number, dmg: number, warhead: keyof typeof DAMAGE_TABLE): void {
    const b = this.buildingById.get(id);
    if (!b || !b.alive) return;
    const mult = DAMAGE_TABLE[warhead].building * BUILDING_DEFS[b.kind].taken;
    b.hp -= dmg * mult;
    this.events.push({ t: 'hit', x: b.x, y: b.y, owner: b.owner });
    if (b.hp <= 0) {
      b.alive = false;
      this.map.clearOccupied(b.tx, b.ty, b.w, b.h);
      this.events.push({ t: 'die', x: b.x, y: b.y, owner: b.owner });
    }
  }

  // ---------------------------------------------------------------- defenses

  /** 占地没被地形、别的建筑挡住。陷坑不写入 occupied，所以要单独查重叠。 */
  footprintFree(tx: number, ty: number, w: number, h: number): boolean {
    if (!this.map.blockRectFree(tx, ty, w, h)) return false;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (tx < b.tx + b.w && tx + w > b.tx && ty < b.ty + b.h && ty + h > b.ty) return false;
    }
    return true;
  }

  private updateDefenses(): void {
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const def = BUILDING_DEFS[b.kind];
      if (def.weapon && b.alive) this.fireTower(b, def.weapon);
    }
  }

  /** 弩台自己占着地，视线从占地外一圈的可走格子算起。 */
  private towerSees(b: Building, tx: number, ty: number): boolean {
    const x1 = Math.floor(tx);
    const y1 = Math.floor(ty);
    for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
      for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
        const inside = x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h;
        if (inside || !this.map.passable(x, y)) continue;
        if (lineOfSight(this.map, x, y, x1, y1)) return true;
      }
    }
    return false;
  }

  /**
   * 工事开火：先打视野里的敌方单位，没兵了才拆建筑。
   * 口径是"凡是能开火的都能打一切能被打的目标"，撞城车不是唯一能拆家的。
   * 判距离一律用矩形最近边，和单位 aimPoint 保持同一套算法。
   */
  private fireTower(b: Building, weapon: { range: number; damage: number; cooldown: number; warhead: 'blade' | 'bolt' | 'charge' | 'siege'; splash?: number; burn?: { seconds: number; dps: number } }): void {
    if (b.cooldown > 0) {
      b.cooldown -= DT;
      return;
    }
    let best = 0;
    let bestD = weapon.range * weapon.range;
    for (const u of this.units) {
      if (!u.alive || u.owner === b.owner) continue;
      const d = (u.x - b.x) ** 2 + (u.y - b.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    if (best !== 0) {
      const target = this.unitById.get(best);
      if (!target) return;
      if (!this.towerSees(b, target.x, target.y)) return;
      b.cooldown = weapon.cooldown;
      this.events.push({ t: 'shot', x: b.x, y: b.y, tx: target.x, ty: target.y, owner: b.owner, kind: weapon.warhead });
      this.damageUnit(best, weapon.damage, weapon.warhead);
      if (weapon.burn) {
        target.burnTime = weapon.burn.seconds;
        target.burnDps = weapon.burn.dps;
      }
      // 溅射：命中点周围一圈吃 55% 伤害，这是烽火台和弩台的根本区别（打散兵群 vs 逐个点杀）
      if (weapon.splash) {
        const r2 = weapon.splash * weapon.splash;
        for (const o of this.units) {
          if (!o.alive || o.owner === b.owner || o.id === best) continue;
          const dd = (o.x - target.x) ** 2 + (o.y - target.y) ** 2;
          if (dd <= r2) {
            this.damageUnit(o.id, weapon.damage * 0.55, weapon.warhead);
            if (weapon.burn) {
              o.burnTime = weapon.burn.seconds;
              o.burnDps = weapon.burn.dps;
            }
          }
        }
      }
      return;
    }

    // 视野里没兵 —— 拆建筑
    let bestB = 0;
    let bestBD = weapon.range * weapon.range;
    let bestEdge: Vec | null = null;
    for (const t of this.buildings) {
      if (!t.alive || t.owner === b.owner || !BUILDING_DEFS[t.kind].targetable) continue;
      if (t.kind === 'xiankeng') continue;
      if (!this.buildingVisible(b.owner, t)) continue;
      // 目标建筑自己占着格子：找它外圈里"塔看得见、且够得着"的最近一格当炮口
      let edge: Vec | null = null;
      let edgeD = Infinity;
      for (let y = t.ty - 1; y <= t.ty + t.h; y++) {
        for (let x = t.tx - 1; x <= t.tx + t.w; x++) {
          const inside = x >= t.tx && x < t.tx + t.w && y >= t.ty && y < t.ty + t.h;
          if (inside || !this.map.passable(x, y)) continue;
          const d = (x + 0.5 - b.x) ** 2 + (y + 0.5 - b.y) ** 2;
          if (d >= edgeD || d > bestBD) continue;
          if (!this.towerSees(b, x + 0.5, y + 0.5)) continue;
          edgeD = d;
          edge = { x: x + 0.5, y: y + 0.5 };
        }
      }
      if (!edge) continue;
      if (edgeD < bestBD) {
        bestBD = edgeD;
        bestB = t.id;
        bestEdge = edge;
      }
    }
    if (bestB === 0 || !bestEdge) return;
    b.cooldown = weapon.cooldown;
    this.events.push({ t: 'shot', x: b.x, y: b.y, tx: bestEdge.x, ty: bestEdge.y, owner: b.owner, kind: weapon.warhead });
    this.damageBuilding(bestB, weapon.damage, weapon.warhead);
  }

  // ---------------------------------------------------------------- harvesters

  private updateHarvester(u: Unit, dt: number): void {
    const def = UNIT_DEFS[u.kind];
    if (u.cargo >= def.cargoMax) u.order = 'deliver';

    if (u.order === 'deliver') {
      const ref = this.nearestOwnBuilding(u.owner, 'canglin', u.x, u.y);
      if (!ref) {
        u.order = 'harvest';
        u.path = [];
        return;
      }
      // 交付点取仓廪正门（南侧中点外侧），让粮车真的开过去，而不是贴着墙角交差
      const gx = ref.tx + ref.w / 2;
      const gy = ref.ty + ref.h + 0.6;
      const d = Math.hypot(gx - u.x, gy - u.y);
      if (d < 0.7) {
        u.path = [];
        u.pathI = 0;
        u.harvestTimer += dt;
        if (u.harvestTimer >= 1.0) {
          this.players[u.owner].credits += Math.round(u.cargo * GRAIN_VALUE);
          u.cargo = 0;
          u.harvestTimer = 0;
          u.order = 'harvest';
        }
      } else {
        this.moveTo(u, gx, gy, dt);
      }
      return;
    }

    const tx = Math.floor(u.x);
    const ty = Math.floor(u.y);
    if (this.map.inBounds(tx, ty) && this.map.ore[this.map.idx(tx, ty)] > 0) {
      u.path = [];
      u.pathI = 0;
      u.harvestTimer += dt;
      if (u.harvestTimer >= HARVEST_RATE) {
        u.harvestTimer = 0;
        const i = this.map.idx(tx, ty);
        const take = Math.min(HARVEST_PER_TICK, this.map.ore[i], def.cargoMax - u.cargo);
        this.map.ore[i] -= take;
        u.cargo += take;
      }
      return;
    }

    if (u.pathI >= u.path.length) {
      const ore = this.map.nearestOre(tx, ty);
      if (ore) this.moveTo(u, ore.x + 0.5, ore.y + 0.5, dt);
    } else {
      this.followPath(u, dt);
    }
  }

  nearestOwnBuilding(owner: number, kind: BuildingKind, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (!b.alive || b.owner !== owner || b.kind !== kind) continue;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- collisions

  private rebuildGrid(): void {
    this.grid.clear();
    for (const u of this.units) {
      if (!u.alive) continue;
      const k = this.cellKey(u.x, u.y);
      let arr = this.grid.get(k);
      if (!arr) {
        arr = [];
        this.grid.set(k, arr);
      }
      arr.push(u);
    }
  }

  private cellKey(x: number, y: number): number {
    const cx = Math.floor(x / GRID_CELL);
    const cy = Math.floor(y / GRID_CELL);
    return cx * 4096 + cy;
  }

  private gridGet(x: number, y: number): Unit[] {
    const out = this.scratch;
    out.length = 0;
    const cx = Math.floor(x / GRID_CELL);
    const cy = Math.floor(y / GRID_CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.grid.get((cx + dx) * 4096 + (cy + dy));
        if (arr) for (const u of arr) out.push(u);
      }
    }
    return out;
  }

  private resolveCollisions(): void {
    const S = this.map.size;
    for (const a of this.units) {
      if (!a.alive) continue;
      const ra = UNIT_DEFS[a.kind].radius;
      const near = this.gridGet(a.x, a.y);
      for (const b of near) {
        if (b === a || !b.alive || b.id < a.id) continue;
        const rb = UNIT_DEFS[b.kind].radius;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = ra + rb;
        if (d < min) {
          if (d < 0.0001) {
            a.x += 0.01;
            continue;
          }
          // mass-weighted shove: a heavy cart nudges light infantry instead of
          // carrying them along, and the push is capped per tick so it looks like
          // units giving way rather than a physics explosion.
          const ma = ra * ra;
          const mb = rb * rb;
          const total = ma + mb;
          const overlap = min - d;
          const pushA = Math.min(overlap * (mb / total), 0.022);
          const pushB = Math.min(overlap * (ma / total), 0.022);
          dx /= d;
          dy /= d;
          a.x -= dx * pushA;
          a.y -= dy * pushA;
          b.x += dx * pushB;
          b.y += dy * pushB;
        }
      }
      const tx = Math.floor(a.x);
      const ty = Math.floor(a.y);
      if (!this.map.passable(tx, ty)) {
        const np = this.map.nearestPassable(tx, ty, 6);
        if (np) {
          a.x += (np.x + 0.5 - a.x) * 0.3;
          a.y += (np.y + 0.5 - a.y) * 0.3;
        }
      }
      a.x = clamp(a.x, 0.3, S - 0.3);
      a.y = clamp(a.y, 0.3, S - 0.3);
    }
  }

  // ---------------------------------------------------------------- cleanup / victory

  private cleanup(): void {
    let dead = false;
    for (const u of this.units) {
      if (!u.alive) {
        dead = true;
        break;
      }
    }
    if (dead) {
      this.units = this.units.filter((u) => u.alive);
      for (const [id, u] of this.unitById) if (!u.alive) this.unitById.delete(id);
    }

    let deadB = false;
    for (const b of this.buildings) {
      if (!b.alive) {
        deadB = true;
        break;
      }
    }
    if (deadB) {
      this.buildings = this.buildings.filter((b) => b.alive);
      for (const [id, b] of this.buildingById) if (!b.alive) this.buildingById.delete(id);
    }
  }

  /** 判定口径：还有活着的单位，或还有能生产/补给的非工事建筑，才算"还活着"。
   *  只挂着一堵拒马不算——既打不了也造不了，等同于输了。 */
  private alivePlayer(owner: number): boolean {
    for (const u of this.units) if (u.alive && u.owner === owner) return true;
    for (const b of this.buildings) {
      if (!b.alive || b.owner !== owner) continue;
      if (b.kind !== 'juma' && b.kind !== 'nutai' && b.kind !== 'xiankeng' && b.kind !== 'fengjiantai') return true;
    }
    return false;
  }

  private checkVictory(): void {
    const p0 = this.alivePlayer(0);
    const p1 = this.alivePlayer(1);
    if (p0 && p1) return;
    if (!p0 && !p1) this.state = 'won';
    else if (!p0) this.state = 'lost';
    else this.state = 'won';
  }
}

export interface AiHook {
  update(world: World): void;
}
