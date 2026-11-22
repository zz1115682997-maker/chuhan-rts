import { World } from '../dist/src/sim/world.js';

const w = new World(12345, 'han', 'chu', 'plains');
for (let i = 0; i < 40; i++) { w.step(); w.events.length = 0; }
console.log('开局 state:', w.state, '| 玩家0 单位:', w.units.filter((u) => u.owner === 0).length, '建筑:', w.buildings.filter((b) => b.owner === 0).length);

// A：玩家0 的建筑全部没了，但军旗车还在 —— 不该判负
for (const b of w.buildings) if (b.owner === 0) b.alive = false;
for (let i = 0; i < 10; i++) { w.step(); w.events.length = 0; }
console.log('A 无建筑只剩军旗车 -> state:', w.state, '| 单位:', w.units.filter((u) => u.alive && u.owner === 0).length);

// A2：加两个兵，模拟"基地爆了但还剩兵"
w.players[0].credits = 9999;
w.spawnUnit('bingzu', 0, 7.5, 8.5);
w.spawnUnit('gongjiang', 0, 8.5, 8.5);
for (let i = 0; i < 10; i++) { w.step(); w.events.length = 0; }
console.log('A2 军旗车被爆、剩 2 兵 -> state:', w.state, '| 单位:', w.units.filter((u) => u.alive && u.owner === 0).length);

// B：把玩家0 所有人打光 —— 才该判负
for (const u of w.units) if (u.owner === 0) u.alive = false;
for (let i = 0; i < 10; i++) { w.step(); w.events.length = 0; }
console.log('B 全灭 -> state:', w.state);
