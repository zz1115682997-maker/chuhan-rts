// Mouse / keyboard input: selection, orders, camera panning, building placement.

import { BUILDING_DEFS, UNIT_DEFS } from '../sim/stats.js';
import type { BuildingKind, UnitKind } from '../sim/types.js';
import type { World } from '../sim/world.js';
import type { Renderer } from '../render/renderer.js';

export interface HudPort {
  toast(msg: string): void;
  refresh(): void;
}

export class Controller {
  selection = new Set<number>();
  selectedBuilding: number | null = null;
  groups = new Map<number, number[]>();
  placing: BuildingKind | null = null;
  attackMode = false;

  private world: World;
  private renderer: Renderer;
  private hud: HudPort;
  private canvas: HTMLCanvasElement;
  private keys = new Set<string>();
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragNow = { x: 0, y: 0 };
  private middleDrag = false;
  private lastMouse = { x: 0, y: 0 };
  private edge = { x: 0, y: 0 };
  private lastClick = { time: 0, kind: '' };

  constructor(world: World, renderer: Renderer, hud: HudPort) {
    this.world = world;
    this.renderer = renderer;
    this.hud = hud;
    this.canvas = renderer.app.canvas as HTMLCanvasElement;
    this.bind();
  }

  // ------------------------------------------------------------- input

  private bind(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events / unsupported capture */
      }
      const p = { x: e.offsetX, y: e.offsetY };
      this.lastMouse = p;
      if (e.button === 1) {
        this.middleDrag = true;
        this.dragStart = p;
        return;
      }
      if (e.button === 2) {
        this.rightClick(p.x, p.y);
        return;
      }
      if (this.placing) {
        this.placeAt(p.x, p.y);
        return;
      }
      this.dragging = true;
      this.dragStart = p;
      this.dragNow = p;
    });

    c.addEventListener('pointermove', (e) => {
      const p = { x: e.offsetX, y: e.offsetY };
      this.lastMouse = p;
      const r = c.getBoundingClientRect();
      this.edge.x = p.x < 24 ? -1 : p.x > r.width - 24 ? 1 : 0;
      this.edge.y = p.y < 24 ? -1 : p.y > r.height - 24 ? 1 : 0;

      if (this.middleDrag) {
        this.renderer.panScreen(this.dragStart.x - p.x, this.dragStart.y - p.y);
        this.dragStart = p;
        return;
      }
      if (this.dragging) this.dragNow = p;
      this.updateGhost();
    });

    c.addEventListener('pointerup', (e) => {
      const p = { x: e.offsetX, y: e.offsetY };
      if (e.button === 1) {
        this.middleDrag = false;
        return;
      }
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (dx * dx + dy * dy > 36) {
        this.boxSelect(this.dragStart, p, e.shiftKey);
      } else {
        this.clickSelect(p.x, p.y, e.shiftKey);
      }
      this.hud.refresh();
    });

    c.addEventListener('pointerleave', () => {
      this.edge.x = 0;
      this.edge.y = 0;
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const before = this.renderer.zoom;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.renderer.zoom = Math.min(1.8, Math.max(0.45, before * factor));
        this.renderer.applyCamera();
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'escape') {
        this.placing = null;
        this.attackMode = false;
        this.selection.clear();
        this.selectedBuilding = null;
        this.renderer.ghost = null;
        this.hud.refresh();
      }
      if (k === 'a') this.attackMode = !this.attackMode;
      if (e.key >= '1' && e.key <= '9') {
        const n = Number(e.key);
        if (e.ctrlKey || e.metaKey) {
          this.groups.set(n, [...this.selection]);
          this.hud.toast(`编队 ${n} 已保存`);
        } else {
          const g = this.groups.get(n);
          if (g) {
            this.selection = new Set(g.filter((id) => this.world.unitById.get(id)?.owner === 0));
            this.hud.refresh();
          }
        }
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Screen-space rectangle while the player is dragging a selection box. */
  getMarquee(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.dragging) return null;
    return { x0: this.dragStart.x, y0: this.dragStart.y, x1: this.dragNow.x, y1: this.dragNow.y };
  }

  // ------------------------------------------------------------- camera

  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    const speed = 900 * dt;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += speed;
    if (this.keys.has('a') && false) dx -= speed; // 'a' is attack-move, not pan
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += speed;
    if (this.keys.has('arrowleft')) dx -= speed;
    dx += this.edge.x * speed * 0.7;
    dy += this.edge.y * speed * 0.7;
    if (dx !== 0 || dy !== 0) this.renderer.panScreen(-dx, -dy);
  }

  // ------------------------------------------------------------- picking

  private unitScreen(u: { x: number; y: number }): { x: number; y: number } {
    return this.renderer.tileToScreen(u.x, u.y);
  }

  private pickOwnUnit(sx: number, sy: number): number | null {
    let best: number | null = null;
    let bestD = 26 * 26;
    for (const u of this.world.units) {
      if (u.owner !== 0) continue;
      const p = this.unitScreen(u);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
  }

  private pickBuildingAt(sx: number, sy: number): number | null {
    const t = this.renderer.screenToTile(sx, sy);
    for (const b of this.world.buildings) {
      if (t.x >= b.tx && t.x <= b.tx + b.w && t.y >= b.ty && t.y <= b.ty + b.h) return b.id;
    }
    return null;
  }

  private clickSelect(sx: number, sy: number, add: boolean): void {
    const id = this.pickOwnUnit(sx, sy);
    if (id !== null) {
      const unit = this.world.unitById.get(id);
      // double click on a unit: grab every unit of the same kind on screen
      const now = performance.now();
      if (unit && this.lastClick.kind === unit.kind && now - this.lastClick.time < 350) {
        this.selection.clear();
        for (const o of this.world.units) {
          if (o.owner !== 0 || o.kind !== unit.kind) continue;
          const p = this.unitScreen(o);
          if (p.x >= 0 && p.x <= this.renderer.screenW && p.y >= 0 && p.y <= this.renderer.screenH) {
            this.selection.add(o.id);
          }
        }
        this.lastClick.time = 0;
        return;
      }
      this.lastClick = { time: now, kind: unit?.kind ?? '' };
      if (!add) this.selection.clear();
      this.selection.add(id);
      this.selectedBuilding = null;
      return;
    }
    const b = this.pickBuildingAt(sx, sy);
    if (b !== null) {
      const bld = this.world.buildingById.get(b);
      if (bld && bld.owner === 0) {
        this.selectedBuilding = b;
        this.selection.clear();
        return;
      }
    }
    if (!add) {
      this.selection.clear();
      this.selectedBuilding = null;
    }
  }

  private boxSelect(a: { x: number; y: number }, b: { x: number; y: number }, add: boolean): void {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (!add) this.selection.clear();
    this.selectedBuilding = null;
    for (const u of this.world.units) {
      if (u.owner !== 0) continue;
      const p = this.unitScreen(u);
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) this.selection.add(u.id);
    }
  }

  // ------------------------------------------------------------- orders

  private rightClick(sx: number, sy: number): void {
    if (this.placing) {
      this.placing = null;
      this.renderer.ghost = null;
      this.hud.refresh();
      return;
    }
    const ids = [...this.selection];
    if (ids.length === 0) return;

    // enemy target?
    const t = this.renderer.screenToTile(sx, sy);
    let targetUnit = 0;
    let targetBuilding = 0;
    for (const u of this.world.units) {
      if (u.owner === 0) continue;
      if ((u.x - t.x) ** 2 + (u.y - t.y) ** 2 < 0.8) {
        targetUnit = u.id;
        break;
      }
    }
    if (targetUnit === 0) {
      for (const b of this.world.buildings) {
        if (b.owner === 0) continue;
        if (t.x >= b.tx && t.x <= b.tx + b.w && t.y >= b.ty && t.y <= b.ty + b.h) {
          targetBuilding = b.id;
          break;
        }
      }
    }

    if (targetUnit !== 0 || targetBuilding !== 0) {
      this.world.enqueue({ c: 'attackTarget', ids, targetUnit, targetBuilding });
      return;
    }
    if (this.attackMode) {
      this.world.enqueue({ c: 'attackMove', ids, x: t.x, y: t.y });
      this.attackMode = false;
    } else {
      this.world.enqueue({ c: 'move', ids, x: t.x, y: t.y });
    }
  }

  // ------------------------------------------------------------- production

  queueBuilding(kind: BuildingKind): void {
    const p = this.world.players[0];
    const def = BUILDING_DEFS[kind];
    if (p.credits < def.cost) {
      this.hud.toast('粮草不足');
      return;
    }
    if (def.requires && !this.world.hasBuilding(0, def.requires)) {
      this.hud.toast(`需要先造${BUILDING_DEFS[def.requires].name}`);
      return;
    }
    if (p.readyBuilding) {
      this.hud.toast('有一个建筑已经造好，先放置它');
      return;
    }
    this.world.enqueue({ c: 'queueBuilding', kind });
    this.hud.refresh();
  }

  queueUnit(kind: UnitKind): void {
    const p = this.world.players[0];
    const def = UNIT_DEFS[kind];
    if (p.credits < def.cost) {
      this.hud.toast('粮草不足');
      return;
    }
    if (!this.world.findProducer(0, kind)) {
      this.hud.toast(`需要先造${BUILDING_DEFS[def.from].name}`);
      return;
    }
    this.world.enqueue({ c: 'queueUnit', kind });
    this.hud.refresh();
  }

  cancelUnit(): void {
    this.world.enqueue({ c: 'cancelUnit' });
    this.hud.refresh();
  }

  cancelBuilding(): void {
    this.world.enqueue({ c: 'cancelBuilding' });
    this.hud.refresh();
  }

  startPlacing(): void {
    const p = this.world.players[0];
    if (!p.readyBuilding) return;
    this.placing = p.readyBuilding;
    this.hud.toast('点击地面放置建筑，右键取消');
  }

  private updateGhost(): void {
    if (!this.placing) {
      this.renderer.ghost = null;
      return;
    }
    const def = BUILDING_DEFS[this.placing];
    const t = this.renderer.screenToTile(this.lastMouse.x, this.lastMouse.y);
    const tx = Math.round(t.x - def.w / 2);
    const ty = Math.round(t.y - def.h / 2);
    const ok =
      this.world.map.blockRectFree(tx, ty, def.w, def.h) &&
      this.world.nearOwnBase(0, tx + def.w / 2, ty + def.h / 2, 9);
    this.renderer.ghost = { tx, ty, w: def.w, h: def.h, ok };
  }

  private placeAt(sx: number, sy: number): void {
    const kind = this.placing;
    if (!kind) return;
    const def = BUILDING_DEFS[kind];
    const t = this.renderer.screenToTile(sx, sy);
    const tx = Math.round(t.x - def.w / 2);
    const ty = Math.round(t.y - def.h / 2);
    if (!this.world.map.blockRectFree(tx, ty, def.w, def.h)) {
      this.hud.toast('这里放不下');
      return;
    }
    if (!this.world.nearOwnBase(0, tx + def.w / 2, ty + def.h / 2, 9)) {
      this.hud.toast('离基地太远');
      return;
    }
    this.world.enqueue({ c: 'placeBuilding', kind, tx, ty });
    this.placing = null;
    this.renderer.ghost = null;
    this.hud.refresh();
  }

  setRally(sx: number, sy: number): void {
    if (this.selectedBuilding === null) return;
    const t = this.renderer.screenToTile(sx, sy);
    this.world.enqueue({ c: 'setRally', id: this.selectedBuilding, x: t.x, y: t.y });
    this.hud.toast('集结点已设置');
  }

  setGameOver(win: boolean): void {
    this.placing = null;
    this.renderer.ghost = null;
    this.hud.toast(win ? '胜利：敌营已破' : '败北：大营失守');
  }
}
