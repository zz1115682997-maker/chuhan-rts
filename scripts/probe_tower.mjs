import { World } from '../dist/src/sim/world.js';

function setup(kind) {
  const w = new World(12345, 'han', 'chu', 'plains');
  for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
  const mcv = w.units.find((u) => u.kind === 'mcv' && u.owner === 0);
  w.deployUnit(mcv.id);
  for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
  w.players[0].credits = 99999;
  w.queueBuilding(0, kind);
  for (let i = 0; i < 600; i++) { w.step(); w.events.length = 0; if (w.players[0].readyBuilding) break; }
  const yard = w.buildings.find((b) => b.kind === 'daying' && b.owner === 0);
  let p = null;
  for (let dy = -7; dy <= 7 && !p; dy++) for (let dx = -7; dx <= 7 && !p; dx++) {
    if (w.tryPlaceBuilding(0, kind, yard.tx + dx, yard.ty + dy)) p = { tx: yard.tx + dx, ty: yard.ty + dy };
  }
  const tower = w.buildings.find((b) => b.kind === kind && b.owner === 0);
  return { w, tower };
}

function crowd(tower, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(tower.w.spawnUnit('bingzu', 1, tower.tower.x + 4 + (i % 3) * 0.8, tower.tower.y + 0.5 + (i % 2) * 0.8));
  }
  return out;
}

for (const kind of ['fengjiantai', 'nutai']) {
  const t = setup(kind);
  const group = crowd(t, 6);
  const hp0 = group.map((u) => u.hp);
  for (let i = 0; i < 500; i++) { t.w.step(); t.w.events.length = 0; }
  const alive = group.filter((u) => u && u.alive).length;
  console.log(`${kind}: 6 个兵挤一圈 -> 剩 ${alive} 个 | 血线 ${group.map((u, i) => (u && u.alive ? u.hp.toFixed(0) : 'X')).join(' ')} (初始 ${hp0[0]})`);
}
