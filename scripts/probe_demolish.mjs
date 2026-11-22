import { World } from '../dist/src/sim/world.js';

function boot(kind) {
  const w = new World(12345, 'han', 'chu', 'plains');
  for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
  const mcv = w.units.find((u) => u.kind === 'mcv' && u.owner === 0);
  w.deployUnit(mcv.id);
  for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
  w.players[0].credits = 999999;
  w.queueBuilding(0, kind);
  for (let i = 0; i < 800; i++) { w.step(); w.events.length = 0; if (w.players[0].readyBuilding) break; }
  const yard = w.buildings.find((b) => b.kind === 'daying' && b.owner === 0);
  let ok = false;
  for (let dy = -8; dy <= 8 && !ok; dy++) for (let dx = -8; dx <= 8 && !ok; dx++) {
    if (w.tryPlaceBuilding(0, kind, yard.tx + dx, yard.ty + dy)) ok = true;
  }
  return { w, t: w.buildings.find((b) => b.kind === kind && b.owner === 0), yard };
}

// 1) 塔拆建筑：把自家大营改成敌方（省得再放靶子），血调薄一点好观察
const a = boot('fengjiantai');
a.yard.owner = 1;
a.yard.hp = 150;
// 保一条命：不然 0 方只剩一座工事，会立刻判负、整局停更
a.w.spawnUnit('bingzu', 0, a.t.x - 6, a.t.y - 6);
for (let i = 0; i < 400; i++) { a.w.step(); a.w.events.length = 0; }
console.log(`烽火台拆建筑（20 秒）: 150 -> ${a.yard.hp.toFixed(0)} ${a.yard.alive ? '(还立着)' : '(已倒塌)'}`);

// 2) 兵拆建筑：兵卒贴着打，看会不会自己动手
const c = boot('nutai');
c.yard.owner = 1;
c.yard.hp = 150;
const bing = c.w.spawnUnit('bingzu', 0, c.yard.tx + 4, c.yard.ty + 1);
for (let i = 0; i < 400; i++) { c.w.step(); c.w.events.length = 0; }
console.log(`兵卒拆建筑（20 秒）: 150 -> ${c.yard.hp.toFixed(0)} ${c.yard.alive ? '(还立着)' : '(已倒塌)'} | 兵${bing.alive ? '活着' : '死了'}`);
