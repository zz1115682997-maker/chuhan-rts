// Battle AI: builds a base, keeps a mixed army, and pushes in escalating waves.
// It only uses the same public commands a human player would issue.

import { AI_BASE } from './map.js';
import { BUILDING_DEFS, UNIT_DEFS } from './stats.js';
import type { Building, BuildingKind, Unit, UnitKind } from './types.js';
import type { World } from './world.js';

export class AIController {
  owner: number;
  private plan: BuildingKind[] = ['bingying', 'chemafang', 'canglin', 'bingying', 'chemafang'];
  private planI = 0;
  private waveSeconds = 80;
  // 开场留出建设期：这段时间只造不动手，让玩家先把建筑和兵排出来
  private graceSeconds = 110;
  // 测试模式：只发展不进攻，玩家可以随便试
  private passive = false;

  setPassive(v: boolean): void {
    this.passive = v;
  }

  constructor(owner = 1) {
    this.owner = owner;
  }

  update(world: World): void {
    if (world.tick % 10 !== 0) return; // think at 2 Hz
    const p = world.players[this.owner];
    if (!p) return;

    // 0) 开局：把基地车开到合适位置展开
    if (!world.hasBuilding(this.owner, 'daying')) {
      const mcv = world.units.find((u) => u.alive && u.owner === this.owner && u.kind === 'mcv');
      if (mcv) {
        const spot = this.findDeploySpot(world);
        if (spot) {
          const cx = spot.x + 1.5;
          const cy = spot.y + 1.5;
          if (Math.hypot(mcv.x - cx, mcv.y - cy) < 1.2) {
            world.enqueue({ c: 'deploy', ids: [mcv.id] });
          } else {
            world.enqueue({ c: 'move', ids: [mcv.id], x: cx, y: cy });
          }
        }
      }
      return;
    }

    // 1) drop a finished building on the map
    if (p.readyBuilding) {
      const spot = world.findPlacement(p.readyBuilding, this.owner, AI_BASE.x, AI_BASE.y, 13);
      if (spot) world.tryPlaceBuilding(this.owner, p.readyBuilding, spot.x, spot.y);
    }

    // 2) buildings first — they unlock everything else
    const nextBuild = this.planI < this.plan.length ? this.plan[this.planI] : null;
    if (nextBuild && p.buildingQueue.length === 0 && !p.readyBuilding) {
      const def = BUILDING_DEFS[nextBuild];
      if (!def.requires || world.hasBuilding(this.owner, def.requires)) {
        if (p.credits >= def.cost) {
          if (world.queueBuilding(this.owner, nextBuild)) this.planI++;
        }
      } else {
        this.planI++;
      }
    }

    // 3) production（休战期内只造建筑，不攒兵，免得解禁那一刻直接一波压死）
    if (world.gameSeconds >= this.graceSeconds && p.unitQueue.length === 0) this.pickUnit(world);

    // 4) defend the base when something is close
    const threat = this.nearestThreat(world, AI_BASE.x, AI_BASE.y, 13);
    if (threat) {
      const army = this.army(world);
      if (army.length > 0) {
        world.enqueue({
          c: 'attackMove',
          ids: army.map((u) => u.id),
          x: threat.x,
          y: threat.y,
        });
      }
      return;
    }

    // 5) attack waves, bigger as the game goes on
    if (this.passive) return;
    if (world.gameSeconds < this.graceSeconds) return;
    const threshold = 7 + Math.min(9, Math.floor(world.gameSeconds / 90) * 2);
    if (world.tick % (this.waveSeconds * 20) === 0) {
      const army = this.army(world);
      if (army.length >= threshold) {
        const target = this.findPlayerBuilding(world);
        if (target) {
          world.enqueue({
            c: 'attackMove',
            ids: army.map((u) => u.id),
            x: target.x,
            y: target.y,
          });
        }
      }
    }
  }

  private army(world: World): Unit[] {
    return world.units.filter(
      (u) => u.alive && u.owner === this.owner && !UNIT_DEFS[u.kind].isHarvester
    );
  }

  private countKind(world: World, kind: UnitKind): number {
    let n = 0;
    for (const u of world.units) {
      if (u.alive && u.owner === this.owner && u.kind === kind) n++;
    }
    return n;
  }

  private findDeploySpot(world: World): { x: number; y: number } | null {
    for (let r = 0; r <= 9; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = AI_BASE.x + dx;
          const ty = AI_BASE.y + dy;
          if (world.map.blockRectFree(tx, ty, 3, 3)) return { x: tx, y: ty };
        }
      }
    }
    return null;
  }

  private nearestThreat(world: World, cx: number, cy: number, radius: number): Unit | null {
    let best: Unit | null = null;
    let bestD = radius * radius;
    for (const u of world.units) {
      if (!u.alive || u.owner === this.owner) continue;
      const d = (u.x - cx) ** 2 + (u.y - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** Rotate through a mix so the army is not all one unit type. */
  private pickUnit(world: World): void {
    const p = world.players[this.owner];
    const faction = p.faction;

    if (
      this.countKind(world, 'grainCart') < 2 &&
      world.hasBuilding(this.owner, 'chemafang') &&
      p.credits >= UNIT_DEFS.grainCart.cost
    ) {
      world.queueUnit(this.owner, 'grainCart');
      return;
    }

    const cycle: UnitKind[] =
      faction === 'han'
        ? ['bingzu', 'bingzu', 'qingqi', 'scout', 'han_caiguan', 'zhanche', 'zhuangche']
        : ['bingzu', 'bingzu', 'qingqi', 'scout', 'chu_zidi', 'zhanche', 'zhuangche'];

    const start = world.tick % cycle.length;
    for (let i = 0; i < cycle.length; i++) {
      const kind = cycle[(start + i) % cycle.length];
      const def = UNIT_DEFS[kind];
      if (p.credits < def.cost) continue;
      if (!world.findProducer(this.owner, kind)) continue;
      world.queueUnit(this.owner, kind);
      return;
    }
  }

  private findPlayerBuilding(world: World): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of world.buildings) {
      if (!b.alive || b.owner === this.owner) continue;
      const d = (b.x - AI_BASE.x) ** 2 + (b.y - AI_BASE.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }
}
