// Headless smoke test: proves the simulation loop actually plays a game without a
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

const world = new World(12345, 'han', 'chu');
world.attachAi(new AIController());

console.log('--- initial state ---');
console.log('player buildings:', world.buildings.filter((b) => b.owner === 0).length);
console.log('enemy  buildings:', world.buildings.filter((b) => b.owner === 1).length);
console.log('player units    :', world.units.filter((u) => u.owner === 0).length);
console.log('enemy  units    :', world.units.filter((u) => u.owner === 1).length);

assert(world.buildings.length >= 4, 'both bases must exist');
assert(world.units.length >= 4, 'starting units must exist');

// --- economy: harvesters must actually generate income -----------------------
const credits0 = world.players[0].credits;
run(world, 20 * 45);
const income = world.players[0].credits - credits0;
console.log('\nincome after 45s :', Math.round(income), 'credits');
assert(income > 0, 'harvesters must deliver grain and earn credits');

// --- production: build a barracks and drop it -------------------------------
world.enqueue({ c: 'queueBuilding', kind: 'bingying' });
world.step();
console.log('building queued  :', world.players[0].buildingQueue.length === 1);
assert(world.players[0].buildingQueue.length === 1, 'barracks should enter the queue');

let placedBarracks = false;
let maxUnits = 0;
let trained = 0;

const TICKS = 20 * 60 * 5; // 5 more minutes
for (let i = 0; i < TICKS; i++) {
  const ready = world.players[0].readyBuilding;
  if (ready && !placedBarracks) {
    const spot = world.findPlacement(ready, 0, 7, 7, 10);
    if (spot) {
      world.enqueue({ c: 'placeBuilding', kind: ready, tx: spot.x, ty: spot.y });
      placedBarracks = true;
    }
  }
  if (i % 60 === 0 && world.hasBuilding(0, 'bingying')) {
    world.enqueue({ c: 'queueUnit', kind: 'han_zu' });
    trained++;
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

console.log('\n--- after ~6 minutes of game time ---');
console.log('state           :', world.state);
console.log('player credits  :', Math.round(world.players[0].credits));
console.log('player units    :', world.units.filter((u) => u.owner === 0).length,
  '(peak ' + maxUnits + ')');
console.log('enemy  units    :', world.units.filter((u) => u.owner === 1).length);
console.log('player blds     :', world.buildings.filter((b) => b.owner === 0).length);
console.log('enemy  blds     :', world.buildings.filter((b) => b.owner === 1).length);
console.log('barracks placed :', placedBarracks);
console.log('infantry ordered:', trained);

const kinds = new Map<string, number>();
for (const u of world.units) kinds.set(u.kind, (kinds.get(u.kind) ?? 0) + 1);
console.log('unit kinds      :', [...kinds.entries()].map(([k, n]) => `${k}x${n}`).join(' '));

assert(placedBarracks, 'player barracks should get placed');
assert(world.players[0].credits >= 0, 'credits must not go negative');
assert(world.buildings.filter((b) => b.owner === 1).length >= 1, 'AI base must survive');
assert(world.units.filter((u) => u.owner === 0 && u.kind === 'han_zu').length > 0,
  'player infantry should be alive');

console.log('\nOK: simulation ran', TICKS + 20 * 45, 'ticks without blowing up.');
