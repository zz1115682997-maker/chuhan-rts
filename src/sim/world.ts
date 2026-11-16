// The deterministic simulation core: fixed 20 Hz tick, no rendering, no DOM.
// Everything in here is pure data + integer/float math so it can run headless.

import { generateMap, PLAYER_BASE, AI_BASE } from './map.js';
import type { GameMap } from './map.js';
import { findPath, lineOfSight } from './path.js';
import { Rng } from './rng.js';
import {
  BUILDING_DEFS, UNIT_DEFS, DAMAGE_TABLE,
  HARVEST_RATE, HARVEST_PER_TICK, GRAIN_VALUE, START_CREDITS,
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

  private nextId = 1;
  private cmds: Command[] = [];
  private grid = new Map<number, Unit[]>();
  private scratch: Unit[] = [];
  private ai: AiHook | null = null;

  constructor(seed: number, playerFaction: Faction = 'han', aiFaction: Faction = 'chu') {
    this.map = generateMap(seed);
    this.rng = new Rng(seed ^ 0x5f3759df);
    this.players = [
      this.makePlayer(0, playerFaction),
      this.makePlayer(1, aiFaction),
    ];
    this.setupBase(0, PLAYER_BASE.x, PLAYER_BASE.y);
    this.setupBase(1, AI_BASE.x, AI_BASE.y);
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
    this.addBuildingAt('daying', owner, cx - 1, cy - 1);
    const spot = this.findPlacement('canglin', owner, cx, cy, 9);
    if (spot) this.addBuildingAt('canglin', owner, spot.x, spot.y);

    const faction = this.players[owner].faction;
    const cartSpot = this.findSpawnSpot(cx, cy, 3);
    if (cartSpot) this.spawnUnit('grainCart', owner, cartSpot.x, cartSpot.y);

    const basic: UnitKind = faction === 'han' ? 'han_zu' : 'chu_zidi';
    const count = faction === 'han' ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const s = this.findSpawnSpot(cx, cy, 4);
      if (s) this.spawnUnit(basic, owner, s.x, s.y);
    }
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
    this.updateProduction();
    this.cleanup();
    this.checkVictory();
    if (this.ai) this.ai.update(this);
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
        }
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
        if (it) p.credits += it.cost;
        break;
      }
      case 'placeBuilding':
        this.tryPlaceBuilding(0, c.kind, c.tx, c.ty);
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
      u.destX = gx;
      u.destY = gy;
      u.order = attack ? 'attack' : 'move';
      u.targetUnit = 0;
      u.targetBuilding = 0;
      u.path = [];
      u.pathI = 0;
      u.repathTimer = 0;
      if (!attack) {
        const from = this.map.nearestPassable(Math.floor(u.x), Math.floor(u.y), 4);
        const to = this.map.nearestPassable(Math.floor(gx), Math.floor(gy), 10);
        if (from && to) {
          const p = findPath(this.map, from.x, from.y, to.x, to.y);
          if (p) {
            u.path = p;
            u.pathI = 0;
          }
        }
      }
    }
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
    if (!this.map.blockRectFree(tx, ty, def.w, def.h)) return false;
    if (!this.nearOwnBase(owner, tx + def.w / 2, ty + def.h / 2, 9)) return false;
    if (p.readyBuilding !== kind) return false;
    this.addBuildingAt(kind, owner, tx, ty);
    p.readyBuilding = null;
    return true;
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
          if (this.map.blockRectFree(tx, ty, def.w, def.h) && this.nearOwnBase(owner, tx + def.w / 2, ty + def.h / 2, 9)) {
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
    this.map.setOccupied(tx, ty, def.w, def.h, b.id);
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
      targetUnit: 0, targetBuilding: 0, cooldown: 0,
      cargo: 0, harvestTimer: 0, repathTimer: 0, stuckTimer: 0,
      lastX: x, lastY: y, alive: true,
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
    if (u.cooldown > 0) u.cooldown -= dt;

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
        u.order = 'idle';
        u.path = [];
        u.pathI = 0;
      }
    } else {
      this.acquireIfIdle(u);
    }

    this.tryFire(u);
  }

  private updateAttack(u: Unit, dt: number): void {
    const def = UNIT_DEFS[u.kind];
    const tp = this.targetPos(u);
    if (tp) {
      const d = Math.hypot(tp.x - u.x, tp.y - u.y);
      const range = def.weapon ? def.weapon.range : 1;
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
      if (!b.alive || b.owner === u.owner) continue;
      const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
      if (d < bestDB) {
        bestDB = d;
        bestB = b.id;
      }
    }
    if (bestB !== 0) u.targetBuilding = bestB;
  }

  private tryFire(u: Unit): void {
    const def = UNIT_DEFS[u.kind];
    if (!def.weapon || u.cooldown > 0) return;
    const tp = this.targetPos(u);
    if (!tp) return;
    const d = Math.hypot(tp.x - u.x, tp.y - u.y);
    if (d > def.weapon.range) return;
    if (!lineOfSight(this.map, Math.floor(u.x), Math.floor(u.y), Math.floor(tp.x), Math.floor(tp.y))) return;
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
    const mult = DAMAGE_TABLE[warhead].building;
    b.hp -= dmg * mult;
    this.events.push({ t: 'hit', x: b.x, y: b.y, owner: b.owner });
    if (b.hp <= 0) {
      b.alive = false;
      this.map.clearOccupied(b.tx, b.ty, b.w, b.h);
      this.events.push({ t: 'die', x: b.x, y: b.y, owner: b.owner });
    }
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
      const d = Math.hypot(ref.x - u.x, ref.y - u.y);
      if (d < 2.4) {
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
        this.moveTo(u, ref.x, ref.y, dt);
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
          const push = (min - d) * 0.5;
          dx /= d;
          dy /= d;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
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

  private checkVictory(): void {
    let p0 = false;
    let p1 = false;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (b.owner === 0) p0 = true;
      else p1 = true;
      if (p0 && p1) return;
    }
    if (!p0 && !p1) this.state = 'won';
    else if (!p0) this.state = 'lost';
    else this.state = 'won';
  }
}

export interface AiHook {
  update(world: World): void;
}
