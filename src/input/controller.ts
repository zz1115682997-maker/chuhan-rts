// Mouse / keyboard input: selection, orders, camera panning, building placement.

import { BUILDING_DEFS, UNIT_DEFS } from '../sim/stats.js';
import type { BuildingKind, UnitKind } from '../sim/types.js';
import type { World } from '../sim/world.js';
import type { Renderer } from '../render/renderer.js';
import { sfxOrder, sfxUnlock } from '../ui/sfx.js';

export interface HudPort {
  toast(msg: string): void;
  refresh(): void;
}

export class Controller {
  selection = new Set<number>();
  selectedBuilding: number | null = null;
  groups = new Map<number, number[]>();
  placing: BuildingKind | null = null;
  private mouseOnMap = false;
  private wallDrag: { x: number; y: number } | null = null;
  attackMode = false;
  /** 红警式左键下令：左键点地面/敌人直接下命令，右键取消 */
  leftClickOrders = true;

  private world: World;
  private renderer: Renderer;
  private hud: HudPort;
  private canvas: HTMLCanvasElement;
  private keys = new Set<string>();
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragNow = { x: 0, y: 0 };
  private middleDrag = false;
  private rightDown: { x: number; y: number } | null = null;
  private rightDrag = false;
  private lastMouse = { x: 0, y: 0 };
  private edge = { x: 0, y: 0 };
  private lastClick = { time: 0, kind: '' };
  private spaceDown = false;

  constructor(world: World, renderer: Renderer, hud: HudPort) {
    this.world = world;
    this.renderer = renderer;
    this.hud = hud;
    this.canvas = renderer.app.canvas as HTMLCanvasElement;
    try {
      this.leftClickOrders = window.localStorage.getItem('opMode') !== 'right';
    } catch {
      /* localStorage 不可用时用默认值 */
    }
    this.bind();
  }

  // ------------------------------------------------------------- input

  private bind(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      sfxUnlock();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events / unsupported capture */
      }
      const p = { x: e.offsetX, y: e.offsetY };
      this.lastMouse = p;
      // 中键，或按住空格 + 左键 = 拖动地图
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault();
        this.middleDrag = true;
        this.dragStart = p;
        return;
      }
      if (e.button === 2) {
        // 右键：短按仍然是下令/取消，按住拖才当拖屏用
        this.rightDown = p;
        this.rightDrag = false;
        return;
      }
      if (this.placing === 'juma') {
        this.wallDrag = p;
        this.updateGhost();
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
      this.mouseOnMap = true;

      if (this.middleDrag) {
        // 抓住地图拖：内容跟着鼠标走
        this.renderer.panScreen(p.x - this.dragStart.x, p.y - this.dragStart.y);
        this.dragStart = p;
        return;
      }
      if (this.rightDown) {
        if (!this.rightDrag) {
          const dx = p.x - this.rightDown.x;
          const dy = p.y - this.rightDown.y;
          if (dx * dx + dy * dy > 36) {
            this.rightDrag = true;
            this.dragStart = this.rightDown;
          }
        }
        if (this.rightDrag) {
          this.renderer.panScreen(p.x - this.dragStart.x, p.y - this.dragStart.y);
          this.dragStart = p;
          return;
        }
      }
      if (this.dragging) this.dragNow = p;
      this.updateGhost();
    });

    c.addEventListener('pointerup', (e) => {
      const p = { x: e.offsetX, y: e.offsetY };
      if (this.middleDrag) {
        this.middleDrag = false;
        return;
      }
      if (e.button === 2) {
        const wasDrag = this.rightDrag;
        this.rightDown = null;
        this.rightDrag = false;
        if (!wasDrag) this.rightClick(p.x, p.y);
        return;
      }
      if (e.button === 0 && this.wallDrag) {
        this.finishWall(p);
        this.wallDrag = null;
        return;
      }
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (dx * dx + dy * dy > 36) {
        this.boxSelect(this.dragStart, p, e.shiftKey);
      } else if (this.leftClickOrders) {
        this.leftClick(p.x, p.y, e.shiftKey);
      } else {
        this.clickSelect(p.x, p.y, e.shiftKey);
      }
      this.hud.refresh();
    });

    // 鼠标推到窗口边缘就滚屏 —— 绑定在 window 上，鼠标压在 HUD 上时也生效
    window.addEventListener('mousemove', (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const M = 44;
      this.edge.x = e.clientX < M ? -1 : e.clientX > w - M ? 1 : 0;
      this.edge.y = e.clientY < M ? -1 : e.clientY > h - M ? 1 : 0;
    });

    c.addEventListener('pointerleave', () => {
      this.edge.x = 0;
      this.edge.y = 0;
      this.mouseOnMap = false;
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
      if (k === ' ') {
        this.spaceDown = true;
        e.preventDefault();
        return;
      }
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
      if (k === 'f') this.deploySelected();
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
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ') this.spaceDown = false;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.spaceDown = false;
      this.middleDrag = false;
      this.dragging = false;
      this.rightDown = null;
      this.rightDrag = false;
    });
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
    const speed = 1200 * dt;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += speed;
    if (this.keys.has('arrowleft')) dx -= speed;
    dx += this.edge.x * speed * 1.15;
    dy += this.edge.y * speed * 1.15;
    if (dx !== 0 || dy !== 0) this.renderer.panScreen(-dx, -dy);
    this.renderer.orderLine = this.orderPreview();
  }

  // ------------------------------------------------------------- picking

  private unitScreen(u: { x: number; y: number }): { x: number; y: number } {
    return this.renderer.tileToScreen(u.x, u.y);
  }

  private pickOwnUnit(sx: number, sy: number): number | null {
    let best: number | null = null;
    let bestD = 40 * 40;
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

  /** 在当前光标位置找敌方目标 */
  private pickEnemyAt(tx: number, ty: number): { unitId: number; buildingId: number } | null {
    for (const u of this.world.units) {
      if (u.owner === 0 || !u.alive || !this.world.unitVisible(0, u)) continue;
      if ((u.x - tx) ** 2 + (u.y - ty) ** 2 < 0.8) return { unitId: u.id, buildingId: 0 };
    }
    for (const b of this.world.buildings) {
      if (b.owner === 0 || !b.alive || !this.world.buildingVisible(0, b)) continue;
      if (tx >= b.tx && tx <= b.tx + b.w && ty >= b.ty && ty <= b.ty + b.h) {
        return { unitId: 0, buildingId: b.id };
      }
    }
    return null;
  }

  /** 红警式左键：点自己人=选中，点敌人=攻击，点地面=移动；Shift=追加路径点 */
  private leftClick(sx: number, sy: number, shift: boolean): void {
    const own = this.pickOwnUnit(sx, sy);
    if (own !== null) {
      const medics = [...this.selection].filter((id) => this.world.unitById.get(id)?.kind === 'weixiuche' && id !== own);
      const patient = this.world.unitById.get(own);
      if (medics.length > 0 && patient && patient.hp < patient.maxHp) {
        this.world.enqueue({ c: 'repairUnit', ids: medics, target: own });
        this.hud.toast('维修车前去修兵');
        return;
      }
      this.clickSelect(sx, sy, shift);
      return;
    }
    const bld = this.pickBuildingAt(sx, sy);
    if (bld !== null) {
      const b = this.world.buildingById.get(bld);
      if (b && b.owner === 0) {
        const workers = [...this.selection].filter((id) => {
          const k = this.world.unitById.get(id)?.kind;
          return k === 'gongjiang' || k === 'weixiuche';
        });
        if (workers.length > 0) {
          this.world.enqueue({ c: 'repair', ids: workers, building: b.id });
          this.hud.toast(workers.some((id) => this.world.unitById.get(id)?.kind === 'weixiuche') ? '维修车前去修缮' : '工匠前去修缮');
          return;
        }
        this.selectedBuilding = bld;
        this.selection.clear();
        return;
      }
    }
    const t = this.renderer.screenToTile(sx, sy);
    const ids = [...this.selection];
    if (ids.length === 0) {
      if (!shift) {
        this.selection.clear();
        this.selectedBuilding = null;
      }
      return;
    }
    const enemy = this.pickEnemyAt(t.x, t.y);
    if (enemy) {
      this.world.enqueue({ c: 'attackTarget', ids, targetUnit: enemy.unitId, targetBuilding: enemy.buildingId });
      sfxOrder();
      return;
    }
    // 单位没点中，再按屏幕包围盒点建筑——建筑立绘很高，点屋顶会落到地面上方，光看格子会漏
    const bid = this.renderer.buildingAt(sx, sy);
    if (bid !== null) {
      const eb = this.world.buildingById.get(bid);
      if (eb && eb.alive && eb.owner !== 0 && this.world.buildingVisible(0, eb)) {
        this.world.enqueue({ c: 'attackTarget', ids, targetUnit: 0, targetBuilding: eb.id });
        sfxOrder();
        return;
      }
    }
    if (shift) {
      this.world.enqueue({ c: 'queueMove', ids, x: t.x, y: t.y });
      sfxOrder();
    } else if (this.attackMode) {
      this.world.enqueue({ c: 'attackMove', ids, x: t.x, y: t.y });
      this.attackMode = false;
      sfxOrder();
    } else {
      this.world.enqueue({ c: 'move', ids, x: t.x, y: t.y });
      sfxOrder();
    }
  }

  private rightClick(sx: number, sy: number): void {
    if (this.placing) {
      this.refundReady();
      return;
    }
    // 选中建筑时右键设置集结点
    if (this.selectedBuilding !== null && this.selection.size === 0) {
      this.setRally(sx, sy);
      return;
    }
    const ids = [...this.selection];
    if (this.leftClickOrders) {
      // 右键只取消选中和目标线。已经下达的移动、攻击继续执行。
      this.attackMode = false;
      this.selection.clear();
      this.selectedBuilding = null;
      this.hud.refresh();
      return;
    }
    if (ids.length === 0) return;

    const t = this.renderer.screenToTile(sx, sy);
    const enemy = this.pickEnemyAt(t.x, t.y);
    if (enemy) {
      this.world.enqueue({
        c: 'attackTarget',
        ids,
        targetUnit: enemy.unitId,
        targetBuilding: enemy.buildingId,
      });
      return;
    }
    const bid = this.renderer.buildingAt(sx, sy);
    if (bid !== null) {
      const eb = this.world.buildingById.get(bid);
      if (eb && eb.alive && eb.owner !== 0 && this.world.buildingVisible(0, eb)) {
        this.world.enqueue({ c: 'attackTarget', ids, targetUnit: 0, targetBuilding: eb.id });
        return;
      }
    }
    if (this.attackMode) {
      this.world.enqueue({ c: 'attackMove', ids, x: t.x, y: t.y });
      this.attackMode = false;
    } else {
      this.world.enqueue({ c: 'move', ids, x: t.x, y: t.y });
    }
  }

  toggleOpMode(): void {
    this.leftClickOrders = !this.leftClickOrders;
    try {
      window.localStorage.setItem('opMode', this.leftClickOrders ? 'left' : 'right');
    } catch {
      /* ignore */
    }
    this.hud.refresh();
    this.hud.toast(
      this.leftClickOrders ? '操作方式：左键下令（红警式）' : '操作方式：右键下令（传统式）'
    );
  }

  sellSelected(): void {
    if (this.selectedBuilding === null) return;
    const b = this.world.buildingById.get(this.selectedBuilding);
    if (!b) return;
    this.world.enqueue({ c: 'sell', id: this.selectedBuilding });
    this.selectedBuilding = null;
    this.hud.toast(b.kind === 'daying' ? '大营已收起，军旗车回到营地。粮草不退' : '已出售，返还一半粮草');
    this.hud.refresh();
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
    if (p.readyBuilding === kind) {
      this.startPlacing();
      return;
    }
    if (p.readyBuilding) {
      this.hud.toast('有建筑已造好：左键放置，右键取消并全额退粮');
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
    this.hud.toast(
      p.readyBuilding === 'juma'
        ? '按住拖动，拒马会连成一排。右键取消，粮草全额退回'
        : '左键放到地上。右键取消，粮草全额退回',
    );
  }

  /** 红警式：造好的建筑，点一下进入放置，再右键删除并全额退粮。 */
  refundReady(): void {
    const p = this.world.players[0];
    if (!p.readyBuilding && !this.placing) return;
    this.world.enqueue({ c: 'cancelBuilding' });
    this.placing = null;
    this.wallDrag = null;
    this.renderer.ghost = null;
    this.renderer.wallCells = null;
    this.hud.toast('已取消，粮草全额退回');
    this.hud.refresh();
  }

  private updateGhost(): void {
    if (this.wallDrag && this.placing === 'juma') {
      this.renderer.ghost = null;
      this.renderer.wallCells = this.previewWall(this.wallDrag, this.lastMouse);
      return;
    }
    this.renderer.wallCells = null;
    if (!this.placing) {
      this.renderer.ghost = null;
      return;
    }
    const def = BUILDING_DEFS[this.placing];
    const t = this.renderer.screenToTile(this.lastMouse.x, this.lastMouse.y);
    const tx = Math.round(t.x - def.w / 2);
    const ty = Math.round(t.y - def.h / 2);
    const ok =
      this.world.footprintFree(tx, ty, def.w, def.h) &&
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
    if (!this.world.footprintFree(tx, ty, def.w, def.h)) {
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

  /** 红警目标线：只在已经下令之后，从单位连到移动点或攻击目标。走到或右键取消就没了。 */
  private orderPreview(): { x: number; y: number; tx: number; ty: number; attack: boolean }[] | null {
    if (this.placing || this.selection.size === 0) return null;
    const lines: { x: number; y: number; tx: number; ty: number; attack: boolean }[] = [];
    for (const id of this.selection) {
      const u = this.world.unitById.get(id);
      if (!u || !u.alive || u.owner !== 0) continue;
      if (u.order === 'attack') {
        const tp = this.attackPoint(u);
        if (tp) lines.push({ x: u.x, y: u.y, tx: tp.x, ty: tp.y, attack: true });
      } else if ((u.order === 'move' || u.order === 'deliver') && Number.isFinite(u.destX)) {
        lines.push({ x: u.x, y: u.y, tx: u.destX, ty: u.destY, attack: false });
      }
    }
    return lines.length > 0 ? lines : null;
  }

  private attackPoint(u: { targetUnit: number; targetBuilding: number; destX: number; destY: number }): { x: number; y: number } | null {
    if (u.targetUnit !== 0) {
      const t = this.world.unitById.get(u.targetUnit);
      if (t && t.alive) return { x: t.x, y: t.y };
    }
    if (u.targetBuilding !== 0) {
      const b = this.world.buildingById.get(u.targetBuilding);
      if (b && b.alive) return { x: b.x, y: b.y };
    }
    if (Number.isFinite(u.destX)) return { x: u.destX, y: u.destY };
    return null;
  }

  private jumaTiles(a: { x: number; y: number }, b: { x: number; y: number }): { tx: number; ty: number }[] {
    const cell = (p: { x: number; y: number }) => {
      const t = this.renderer.screenToTile(p.x, p.y);
      return { tx: Math.round(t.x - 0.5), ty: Math.round(t.y - 0.5) };
    };
    const s = cell(a);
    const e = cell(b);
    const tiles: { tx: number; ty: number }[] = [];
    if (Math.abs(e.tx - s.tx) >= Math.abs(e.ty - s.ty)) {
      const n = Math.min(20, Math.abs(e.tx - s.tx));
      const step = e.tx >= s.tx ? 1 : -1;
      for (let i = 0; i <= n; i++) tiles.push({ tx: s.tx + i * step, ty: s.ty });
    } else {
      const n = Math.min(20, Math.abs(e.ty - s.ty));
      const step = e.ty >= s.ty ? 1 : -1;
      for (let i = 0; i <= n; i++) tiles.push({ tx: s.tx, ty: s.ty + i * step });
    }
    return tiles;
  }

  private previewWall(a: { x: number; y: number }, b: { x: number; y: number }): { tx: number; ty: number; ok: boolean }[] {
    const tiles = this.jumaTiles(a, b);
    const cost = BUILDING_DEFS.juma.cost;
    let credits = this.world.players[0].credits;
    let usedReady = this.world.players[0].readyBuilding === 'juma';
    const placed: { tx: number; ty: number }[] = [];
    const near = (tx: number, ty: number): boolean => {
      if (this.world.nearOwnBase(0, tx + 0.5, ty + 0.5, 9)) return true;
      for (const p of placed) {
        const dx = p.tx - tx;
        const dy = p.ty - ty;
        if (dx * dx + dy * dy <= 81) return true;
      }
      return false;
    };
    return tiles.map((t) => {
      const ok = this.world.footprintFree(t.tx, t.ty, 1, 1) && near(t.tx, t.ty) && (usedReady || credits >= cost);
      if (ok) {
        if (usedReady) usedReady = false;
        else credits -= cost;
        placed.push(t);
      }
      return { tx: t.tx, ty: t.ty, ok };
    });
  }

  private finishWall(p: { x: number; y: number }): void {
    if (!this.wallDrag) return;
    const cells = this.previewWall(this.wallDrag, p);
    const tiles: { x: number; y: number }[] = [];
    for (const c of cells) {
      if (!c.ok) break;
      tiles.push({ x: c.tx, y: c.ty });
    }
    this.renderer.wallCells = null;
    this.renderer.ghost = null;
    if (tiles.length === 0) {
      this.hud.toast('这一排放不下');
      return;
    }
    this.world.enqueue({ c: 'placeWall', kind: 'juma', tiles });
    this.placing = null;
    this.hud.toast(tiles.length > 1 ? `拒马连成 ${tiles.length} 段` : '拒马已放下');
    this.hud.refresh();
  }

  setRally(sx: number, sy: number): void {
    if (this.selectedBuilding === null) return;
    const t = this.renderer.screenToTile(sx, sy);
    this.world.enqueue({ c: 'setRally', id: this.selectedBuilding, x: t.x, y: t.y });
    this.hud.toast('集结点已设置');
  }

  /** 基地车展开成大营（红警式 MCV deploy） */
  deploySelected(): void {
    const def = BUILDING_DEFS.daying;
    for (const id of this.selection) {
      const u = this.world.unitById.get(id);
      if (!u || !u.alive || u.kind !== 'mcv') continue;
      const tx = Math.round(u.x - def.w / 2);
      const ty = Math.round(u.y - def.h / 2);
      if (!this.world.map.blockRectFree(tx, ty, def.w, def.h)) {
        this.hud.toast('这里太窄立不了旗，换个开阔地');
        return;
      }
      this.world.enqueue({ c: 'deploy', ids: [id] });
      this.selection.delete(id);
      this.hud.refresh();
      this.hud.toast('立旗扎营…');
      return;
    }
    this.hud.toast('先选中军旗');
  }

  setGameOver(win: boolean): void {
    this.placing = null;
    this.renderer.ghost = null;
    this.hud.toast(win ? '胜利：敌营已破' : '败北：大营失守');
  }
}
