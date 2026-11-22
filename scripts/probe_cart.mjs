import { World } from '../dist/src/sim/world.js';

const w = new World(12345, 'han', 'chu', 'plains');
w.players[0].credits = 6000;

const mcv = w.units.find((u) => u.owner === 0 && u.kind === 'mcv');
console.log('state', w.state, 'mcv', mcv && mcv.id, 'units', w.units.length);
w.enqueue({ c: 'deploy', ids: [mcv.id] });
for (let i = 0; i < 5; i++) w.step();
console.log('after deploy: buildings', w.buildings.map((b) => b.kind + ':' + b.owner));

w.enqueue({ c: 'queueBuilding', kind: 'canglin' });
let guard = 0;
while (!w.players[0].readyBuilding && guard++ < 20 * 40) w.step();
const yard = w.buildings.find((b) => b.owner === 0 && b.kind === 'daying');
console.log('ready:', w.players[0].readyBuilding, 'yard at', yard && `${yard.x},${yard.y}`);
const spot = w.findPlacement('canglin', 0, yard.x, yard.y, 12);
if (!spot) throw new Error('no spot');
w.enqueue({ c: 'placeBuilding', kind: 'canglin', tx: spot.x, ty: spot.y });
for (let i = 0; i < 5; i++) w.step();

const oil = w.map;
let fields = 0;
for (let y = 0; y < oil.size; y++)
  for (let x = 0; x < oil.size; x++) if (oil.terrain[oil.idx(x, y)] === 4) fields++;
console.log('tiles tagged as farmland:', fields);

const carts = w.units.filter((u) => u.owner === 0 && u.kind === 'grainCart');
console.log('carts:', carts.length);
const c0 = carts[0];
console.log('cart order:', c0?.order, 'at', c0 && `${c0.x.toFixed(2)},${c0.y.toFixed(2)}`);

const start = w.players[0].credits;
const g = w.buildings.find((b) => b.owner === 0 && b.kind === 'canglin');
console.log('canglin center', g && `${g.x},${g.y}`, 'footprint', g && `${g.tx},${g.ty} ${g.w}x${g.h}`);
let moved = 0;
let lastX = carts[0].x;
for (let t = 0; t < 20 * 22; t++) {
  w.step();
  w.events.length = 0;
  const c = carts[0];
  if (c && Math.abs(c.x - lastX) > 0.02) {
    moved++;
    lastX = c.x;
  }
  if (t % 20 === 0) {
    if (c) {
      const d = Math.hypot(g.x - c.x, g.y - c.y);
      const tx = Math.floor(c.x);
      const ty = Math.floor(c.y);
      const ore = w.map.inBounds(tx, ty) ? w.map.ore[w.map.idx(tx, ty)] : -1;
      console.log(
        `t=${(t / 20).toFixed(0)}s credits=${Math.round(w.players[0].credits)} ` +
          `cart=${c.x.toFixed(2)},${c.y.toFixed(2)} order=${c.order} cargo=${c.cargo} ` +
          `dCang=${d.toFixed(2)} oreHere=${ore} movedSteps=${moved}`,
      );
    } else {
      console.log(`t=${(t / 20).toFixed(0)}s cart gone`);
    }
  }
}
console.log('income over 60s:', Math.round(w.players[0].credits - start));

