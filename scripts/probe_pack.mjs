import { World } from '../dist/src/sim/world.js';

const world = new World(12345, 'han', 'chu', 'plains');
for (let i = 0; i < 40; i++) { world.step(); world.events.length = 0; }

const mcv = world.units.find((u) => u.kind === 'mcv' && u.owner === 0);
console.log('mcv before:', mcv ? `${mcv.x.toFixed(2)},${mcv.y.toFixed(2)}` : 'none');
world.deployUnit(mcv.id);
for (let i = 0; i < 30; i++) { world.step(); world.events.length = 0; }

let yard = world.buildings.find((b) => b.kind === 'daying' && b.owner === 0);
console.log('yard:', yard ? `#${yard.id} at ${yard.tx},${yard.ty} ${yard.w}x${yard.h}` : 'none');

const ok = world.packYard(yard.id);
for (let i = 0; i < 10; i++) { world.step(); world.events.length = 0; }

const yard2 = world.buildings.find((b) => b.kind === 'daying' && b.owner === 0);
const mcv2 = world.units.find((u) => u.kind === 'mcv' && u.owner === 0);
console.log('packYard ->', ok);
console.log('yard after:', yard2 ? 'still there (BUG)' : 'gone');
console.log('mcv after:', mcv2 ? `at ${mcv2.x.toFixed(2)},${mcv2.y.toFixed(2)} hp=${mcv2.hp}` : 'none (BUG)');
console.log('state:', world.state);
console.log('player0 alive?', world.buildings.some((b) => b.alive && b.owner === 0) || world.units.some((u) => u.alive && u.owner === 0));

// 再展开回去，确认来回可逆
if (mcv2) {
  const ok2 = world.deployUnit(mcv2.id);
  for (let i = 0; i < 10; i++) { world.step(); world.events.length = 0; }
  const yard3 = world.buildings.find((b) => b.kind === 'daying' && b.owner === 0);
  console.log('re-deploy ->', ok2, yard3 ? `yard back at ${yard3.tx},${yard3.ty}` : 'none (BUG)');
}
console.log('final state:', world.state);
