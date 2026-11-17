import { AIController } from './sim/ai.js';
import { UNIT_DEFS } from './sim/stats.js';
import { DT, World } from './sim/world.js';
import { Renderer } from './render/renderer.js';
import { Controller } from './input/controller.js';
import { Hud } from './ui/hud.js';
import { showMenu } from './ui/menu.js';

const pageErrors: string[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => pageErrors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => pageErrors.push('rejection:' + String(e.reason)));
}

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('#game host missing');

  const params = new URLSearchParams(location.search);
  const auto = params.has('auto');
  const setup = auto
    ? {
        playerFaction: (params.get('faction') === 'chu' ? 'chu' : 'han') as 'han' | 'chu',
        aiFaction: (params.get('faction') === 'chu' ? 'han' : 'chu') as 'han' | 'chu',
        mapKind: (params.get('map') ?? 'plains') as 'plains' | 'river' | 'mountain' | 'islands',
        seed: 1108,
      }
    : await showMenu();

  const world = new World(setup.seed, setup.playerFaction, setup.aiFaction, setup.mapKind);
  world.attachAi(new AIController(1));

  const renderer = await Renderer.create(host, world);
  const hud = new Hud(world);
  const ctrl = new Controller(world, renderer, hud);
  hud.attach(ctrl, renderer);

  const startMcv = world.units.find((u) => u.owner === 0 && u.kind === 'mcv');
  if (startMcv) renderer.centerOn(startMcv.x, startMcv.y);
  else renderer.centerOn(10, 10);
  renderer.applyCamera();
  hud.refresh();
  hud.toast('选中军旗 → 开到想建营的位置 → 按 F 立旗扎营');

  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.remove();

  let last = performance.now();
  let acc = 0;
  let over = false;

  const frame = (now: number): void => {
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;

    ctrl.update(dt);
    if (world.state === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 6) {
        world.step();
        acc -= DT;
        steps++;
      }
    } else if (!over) {
      over = true;
      ctrl.setGameOver(world.state === 'won');
      hud.gameOver(world.state === 'won');
    }

    renderer.pushEvents();
    renderer.selection = ctrl.selection;
    renderer.selectionBuilding = ctrl.selectedBuilding;
    renderer.marquee = ctrl.getMarquee();
    renderer.draw(dt);
    hud.tick();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (location.search.includes('selftest')) {
    void runSelfTest(world, renderer, ctrl);
  }
}

/** Drives synthetic pointer events through the real input path, so a headless
 *  browser can prove that selecting and ordering actually works end to end. */
async function runSelfTest(world: World, renderer: Renderer, ctrl: Controller): Promise<void> {
  const results: string[] = [];
  const push = (s: string): void => {
    results.push(s);
    document.title = 'SELFTEST ' + results.join(' ');
  };
  const canvas = renderer.app.canvas as HTMLCanvasElement;
  const rect = (): DOMRect => canvas.getBoundingClientRect();
  const pump = (n = 3): void => {
    for (let i = 0; i < n; i++) world.step();
  };
  const send = (type: string, x: number, y: number, button = 0, buttons = 1, shift = false): void => {
    const r = rect();
    canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: r.left + x,
        clientY: r.top + y,
        button,
        buttons,
        shiftKey: shift,
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
        cancelable: true,
      })
    );
  };

  try {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 50));

    // 先展开基地车，并造几个测试单位
    const mcv = world.units.find((u) => u.owner === 0 && u.kind === 'mcv');
    if (mcv) {
      world.enqueue({ c: 'deploy', ids: [mcv.id] });
      pump(5);
    }
    push(`mcv-deploy:${world.hasBuilding(0, 'daying') ? 'OK' : 'FAIL'}`);

    const base = world.buildings.find((b) => b.owner === 0 && b.kind === 'daying');
    if (base) {
      for (let i = 0; i < 3; i++) {
        const s = world.findSpawnSpot(base.x, base.y, 4);
        if (s) world.spawnUnit('bingzu', 0, s.x, s.y);
      }
      pump(3);
    }

    const unit = world.units.find((u) => u.owner === 0 && !UNIT_DEFS[u.kind].isHarvester);
    if (!unit) {
      push('no-unit:FAIL');
      return;
    }
    const p = renderer.tileToScreen(unit.x, unit.y);

    send('pointerdown', p.x, p.y);
    send('pointerup', p.x, p.y);
    push(`click-select:${ctrl.selection.has(unit.id) ? 'OK' : 'FAIL'}`);

    send('pointerdown', p.x - 150, p.y - 110);
    send('pointermove', p.x + 150, p.y + 110);
    send('pointerup', p.x + 150, p.y + 110);
    push(`box-select:${ctrl.selection.size >= 2 ? 'OK(' + ctrl.selection.size + ')' : 'FAIL(' + ctrl.selection.size + ')'}`);

    const target = renderer.tileToScreen(unit.x + 6, unit.y + 4);
    send('pointerdown', target.x, target.y);
    send('pointerup', target.x, target.y);
    pump(3);
    const moving = [...ctrl.selection]
      .map((id) => world.unitById.get(id))
      .filter((u) => u && (u.order === 'move' || u.order === 'attack'));
    push(`left-click-move:${moving.length > 0 ? 'OK' : 'FAIL'}`);

    // Shift + 左键 = 追加路径点
    const wp = renderer.tileToScreen(unit.x - 5, unit.y - 5);
    send('pointerdown', wp.x, wp.y, 0, 1, true);
    send('pointerup', wp.x, wp.y, 0, 1, true);
    pump(3);
    const queued = [...ctrl.selection]
      .map((id) => world.unitById.get(id))
      .some((u) => u && u.waypoints.length > 0);
    push(`waypoint:${queued ? 'OK' : 'FAIL'}`);

    const before = new Map([...ctrl.selection].map((id) => [id, world.unitById.get(id)?.x ?? 0]));
    pump(30);
    let movedCount = 0;
    for (const [id, x0] of before) {
      const u = world.unitById.get(id);
      if (u && Math.abs(u.x - x0) > 0.2) movedCount++;
    }
    push(`units-moved:${movedCount > 0 ? 'OK(' + movedCount + ')' : 'FAIL'}`);

    ctrl.queueBuilding('bingying');
    pump(3);
    push(`build-queue:${world.players[0].buildingQueue.length > 0 ? 'OK' : 'FAIL'}`);

    pump(200);
    push(`build-ready:${world.players[0].readyBuilding ? 'OK' : 'FAIL'}`);
    ctrl.startPlacing();
    push(`placing-mode:${ctrl.placing ? 'OK' : 'FAIL'}`);
    ctrl.placing = null;
    renderer.ghost = null;

    // 把造好的兵营落地，然后测试出售
    const readyKind = world.players[0].readyBuilding;
    if (readyKind && base) {
      const spot = world.findPlacement(readyKind, 0, base.x, base.y, 10);
      if (spot) {
        world.enqueue({ c: 'placeBuilding', kind: readyKind, tx: spot.x, ty: spot.y });
        pump(3);
      }
    }

    // 出售建筑
    const bld = world.buildings.find((b) => b.owner === 0 && b.kind === 'bingying');
    if (bld) {
      const before = world.players[0].credits;
      ctrl.selectedBuilding = bld.id;
      ctrl.sellSelected();
      pump(3);
      const gone = !world.buildingById.get(bld.id);
      push(`sell-building:${gone && world.players[0].credits > before ? 'OK' : 'FAIL'}`);
    } else {
      push('sell-building:SKIP');
    }
  } catch (err) {
    push('exception:' + String(err));
  } finally {
    const verdict = results.join(' ') + ' errors:' + (pageErrors.join(' | ') || 'none');
    document.title = 'SELFTEST ' + verdict;
    const box = document.createElement('div');
    box.id = 'selftest';
    box.textContent = verdict;
    box.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99999;color:#0f0;font:12px monospace';
    document.body.appendChild(box);
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText =
    'position:fixed;inset:0;margin:0;padding:24px;background:#110d0d;color:#ff8a7a;' +
    'font:13px/1.5 Consolas,monospace;overflow:auto;z-index:9999;white-space:pre-wrap';
  const e = err as Error;
  pre.textContent = String(e?.stack ?? e);
  document.body.appendChild(pre);
});
