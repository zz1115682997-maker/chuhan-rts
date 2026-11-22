import { World } from '../dist/src/sim/world.js';

const w = new World(12345, 'han', 'chu', 'plains');
for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
const mcv = w.units.find((u) => u.kind === 'mcv' && u.owner === 0);
w.deployUnit(mcv.id);
for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
w.players[0].credits = 999999;
w.queueBuilding(0, 'fengjiantai');
for (let i = 0; i < 800; i++) { w.step(); w.events.length = 0; if (w.players[0].readyBuilding) break; }
console.log('readyBuilding =', w.players[0].readyBuilding);
const yard = w.buildings.find((b) => b.kind === 'daying' && b.owner === 0);
let placed = null;
for (let dy = -8; dy <= 8 && !placed; dy++) for (let dx = -8; dx <= 8 && !placed; dx++) {
  if (w.tryPlaceBuilding(0, 'fengjiantai', yard.tx + dx, yard.ty + dy)) placed = { dx, dy };
}
console.log('placed at', placed);
const t = w.buildings.find((b) => b.kind === 'fengjiantai' && b.owner === 0);
console.log('tower', t && { tx: t.tx, ty: t.ty, x: t.x, y: t.y, alive: t.alive, hp: t.hp, cooldown: t.cooldown });
console.log('yard', { tx: yard.tx, ty: yard.ty, owner: yard.owner, alive: yard.alive });
yard.owner = 1;
yard.hp = 150;
for (let i = 0; i < 20; i++) { w.step(); w.events.length = 0; }
console.log('tower cooldown after 1s', t.cooldown);
console.log('buildingVisible(0, yard)', w.buildingVisible(0, yard));
console.log('yard hp', yard.hp);
