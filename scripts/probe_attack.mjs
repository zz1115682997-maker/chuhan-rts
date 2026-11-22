import { World } from '../dist/src/sim/world.js';

const w = new World(12345, 'han', 'chu', 'plains');

// 给敌方摆一座大营，再放一辆战车在边上
const yard = w.addBuildingAt('daying', 1, 20, 20);
const tank = w.spawnUnit('zhanche', 0, 23.5, 21.5);

w.enqueue({ c: 'attackTarget', ids: [tank.id], targetUnit: 0, targetBuilding: yard.id });

console.log('yard hp', yard.hp, 'tank order', tank.order, 'target', tank.targetBuilding);
for (let t = 0; t < 20 * 30; t++) {
  w.step();
  w.events.length = 0;
  if (t % (20 * 5) === 0) {
    console.log(
      `t=${(t / 20).toFixed(0)}s hp=${Math.round(yard.hp)} alive=${yard.alive} ` +
        `tank=${tank.x.toFixed(1)},${tank.y.toFixed(1)} order=${tank.order} cd=${tank.cooldown.toFixed(2)}`,
    );
  }
}
