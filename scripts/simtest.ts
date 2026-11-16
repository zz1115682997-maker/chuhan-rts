// Headless smoke test: proves the simulation loop plays a real game without a
// renderer. Run with `npm run build && npm run simtest`.

import { AIController } from '../src/sim/ai.js';
import { World } from '../src/sim/world.js';

declare const process: { exitCode: number };

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    world.step();
    world.events.length = 0;
  }
}

const world = new World(12345, 'han', 'chu', 'plains');
world.attachAi(new AIController(1));

console.log('--- initial state ---');
console.log('player buildings:', world.buildings.filter((b) => b.owner === 0).length);
console.log('enemy  buildings:', world.buildings.filter((b) => b.owner === 1).length);
console.log('player units    :', world.units.filter((u) => u.owner === 0).length);
console.log('enemy  units    :', world.units.filter((u) => u.owner === 1).length);

assert(world.buildings.length === 0, 'both sides start with no buildings, only an MCV');
assert(world.units.filter((u) => u.owner === 0).length === 1, 'player starts with exactly one unit');

// --- 1) deploy the base vehicle ---------------------------------------------
const mcv = world.units.find((u) => u.owner === 0 && u.kind === 'mcv');
assert(!!mcv, 'player must start with an MCV');
world.enqueue({ c: 'deploy', ids: [mcv!.id] });
run(world, 5);
const yard = world.buildings.find((b) => b.owner === 0 && b.kind === 'daying');
console.log('\nMCV deployed    :', !!yard);
assert(!!yard, 'MCV must deploy into a construction yard');

// --- 2) build a granary, which comes with a free grain cart -----------------
world.enqueue({ c: 'queueBuilding', kind: 'canglin' });
run(world, 5);
console.log('granary queued :', world.players[0].buildingQueue.length === 1);
assert(world.players[0].buildingQueue.length === 1, 'granary should enter the build queue');

let guard = 0;
while (!world.players[0].readyBuilding && guard++ < 20 * 30) {
  world.step();
  world.events.length = 0;
}
const granarySpot = world.findPlacement('canglin', 0, yard!.x, yard!.y, 10);
assert(!!granarySpot, 'granary needs a free footprint near the yard');
world.enqueue({ c: 'placeBuilding', kind: 'canglin', tx: granarySpot!.x, ty: granarySpot!.y });
run(world, 5);

const carts = world.units.filter((u) => u.owner === 0 && u.kind === 'grainCart');
console.log('free grain cart:', carts.length);
assert(carts.length >= 1, 'placing a granary should grant a free grain cart');

// --- 3) economy -------------------------------------------------------------
const credits0 = world.players[0].credits;
run(world, 20 * 45);
const income = world.players[0].credits - credits0;
console.log('income after 45s:', Math.round(income), 'credits');
assert(income > 0, 'grain carts must deliver and earn credits');

// --- 4) barracks + army ------------------------------------------------------
world.enqueue({ c: 'queueBuilding', kind: 'bingying' });
guard = 0;
while (!world.players[0].readyBuilding && guard++ < 20 * 40) {
  world.step();
  world.events.length = 0;
}
const barracksSpot = world.findPlacement('bingying', 0, yard!.x, yard!.y, 10);
assert(!!barracksSpot, 'barracks needs a free footprint');
world.enqueue({ c: 'placeBuilding', kind: 'bingying', tx: barracksSpot!.x, ty: barracksSpot!.y });
run(world, 5);
console.log('barracks placed :', world.hasBuilding(0, 'bingying'));
assert(world.hasBuilding(0, 'bingying'), 'barracks should be standing');

// --- 5) long run: both sides play for 5 minutes ------------------------------
let maxUnits = 0;
const TICKS = 20 * 60 * 5;
for (let i = 0; i < TICKS; i++) {
  if (i % 60 === 0) {
    const kind = (i / 60) % 2 === 0 ? 'han_zu' : 'han_nuge';
    world.enqueue({ c: 'queueUnit', kind });
  }
  world.step();
  world.events.length = 0;

  if (world.units.length > maxUnits) maxUnits = world.units.length;
  assert(Number.isFinite(world.players[0].credits), 'credits became NaN');
  for (const u of world.units) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) {
      throw new Error(`unit ${u.id} (${u.kind}) has non-finite position`);
    }
    if (u.x < 0 || u.y < 0 || u.x > world.map.size || u.y > world.map.size) {
      throw new Error(`unit ${u.id} escaped the map at ${u.x},${u.y}`);
    }
  }
}

console.log('\n--- after ~6 minutes ---');
console.log('state           :', world.state);
console.log('player credits  :', Math.round(world.players[0].credits));
console.log('player units    :', world.units.filter((u) => u.owner === 0).length, '(peak ' + maxUnits + ')');
console.log('enemy  units    :', world.units.filter((u) => u.owner === 1).length);
console.log('player blds     :', world.buildings.filter((b) => b.owner === 0).length);
console.log('enemy  blds     :', world.buildings.filter((b) => b.owner === 1).length);

const kinds = new Map<string, number>();
for (const u of world.units) kinds.set(u.kind, (kinds.get(u.kind) ?? 0) + 1);
console.log('unit kinds      :', [...kinds.entries()].map(([k, n]) => `${k}x${n}`).join(' '));

assert(world.buildings.filter((b) => b.owner === 1).length >= 1, 'AI base must survive');
assert(world.buildings.filter((b) => b.owner === 0).length >= 1, 'player base must survive');
assert(maxUnits > 10, 'both sides should field a real army');

console.log('\nOK: simulation ran without blowing up.');
