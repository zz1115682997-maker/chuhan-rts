// Simple battle AI: builds a base, trains an army, and throws waves at the player.
// It talks to the world only through the same public commands a human would use.

import { AI_BASE } from './map.js';
import { UNIT_DEFS } from './stats.js';
import type { BuildingKind, Unit, UnitKind } from './types.js';
import type { World } from './world.js';

export class AIController {
  owner: number;
  private plan: BuildingKind[] = ['bingying', 'chemafang', 'canglin', 'bingying'];
  private planI = 0;
  private waveTicks = 40 * 20;
  private nextWave = 40 * 20;

  constructor(owner = 1) {
    this.owner = owner;
  }

  update(world: World): void {
    if (world.tick % 10 !== 0) return; // think at 2 Hz
    const p = world.players[this.owner];
    if (!p) return;

    // 1) drop a finished building on the map
    if (p.readyBuilding) {
      const kind = p.readyBuilding;
      const spot = world.findPlacement(kind, this.owner, AI_BASE.x, AI_BASE.y, 13);
      if (spot) world.tryPlaceBuilding(this.owner, kind, spot.x, spot.y);
    }

    // 2) keep the build plan moving
    if (p.buildingQueue.length === 0 && !p.readyBuilding && this.planI < this.plan.length) {
      if (world.queueBuilding(this.owner, this.plan[this.planI])) this.planI++;
    }

    // 3) keep production busy
    if (p.unitQueue.length === 0) this.pickUnit(world);

    // 4) attack waves
    if (world.tick >= this.nextWave) {
      this.nextWave = world.tick + this.waveTicks;
      const army = this.army(world);
      if (army.length >= 5) {
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

  private carts(world: World): number {
    let n = 0;
    for (const u of world.units) {
      if (u.alive && u.owner === this.owner && UNIT_DEFS[u.kind].isHarvester) n++;
    }
    return n;
  }

  private pickUnit(world: World): void {
    const p = world.players[this.owner];
    const faction = p.faction;

    if (this.carts(world) < 2 && world.hasBuilding(this.owner, 'chemafang') && p.credits >= UNIT_DEFS.grainCart.cost) {
      world.queueUnit(this.owner, 'grainCart');
      return;
    }

    const foot: UnitKind = faction === 'han' ? 'han_zu' : 'chu_zidi';
    const ranged: UnitKind = faction === 'han' ? 'han_nuge' : 'chu_zidi';
    const fast: UnitKind = faction === 'han' ? 'han_wugang' : 'chu_qi';
    const heavy: UnitKind = faction === 'han' ? 'han_wugang' : 'chu_chongche';

    let pick: UnitKind = foot;
    if (p.credits > 2400) pick = heavy;
    else if (p.credits > 1500) pick = fast;
    else if (p.credits > 600) pick = ranged;
    else pick = foot;

    const def = UNIT_DEFS[pick];
    if (world.findProducer(this.owner, pick) && p.credits >= def.cost) {
      world.queueUnit(this.owner, pick);
    }
  }

  private findPlayerBuilding(world: World): { x: number; y: number } | null {
    for (const b of world.buildings) {
      if (b.alive && b.owner !== this.owner) return { x: b.x, y: b.y };
    }
    return null;
  }
}
