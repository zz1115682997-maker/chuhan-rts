// DOM HUD: resources, build panel, production queues, minimap, toasts, end screen.

import { BUILDING_DEFS, FACTION_NAMES, UNIT_DEFS } from '../sim/stats.js';
import type { BuildingKind, UnitKind } from '../sim/types.js';
import type { World } from '../sim/world.js';
import type { Controller } from '../input/controller.js';
import type { Renderer } from '../render/renderer.js';

export interface HudPort {
  toast(msg: string): void;
  refresh(): void;
}

const STRUCTURES: BuildingKind[] = ['bingying', 'canglin', 'chemafang'];
const WORKS: BuildingKind[] = ['juma', 'nutai', 'xiankeng'];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export class Hud implements HudPort {
  private world: World;
  private ctrl: Controller | null = null;
  private renderer: Renderer | null = null;

  private creditsEl: HTMLElement;
  private timerEl: HTMLElement;
  private toastEl: HTMLElement;
  private infoEl: HTMLElement;
  private queueEl: HTMLElement;
  private buildBtns = new Map<string, HTMLButtonElement>();
  private unitBtns = new Map<string, HTMLButtonElement>();
  private minimap: HTMLCanvasElement;
  private mmCtx: CanvasRenderingContext2D;
  private overlay: HTMLElement;
  private placeBtn: HTMLButtonElement;
  private deployBtn: HTMLButtonElement;
  private sellBtn: HTMLButtonElement;
  private opBtn: HTMLButtonElement;
  private toastLife = 0;
  private frameCount = 0;

  constructor(world: World) {
    this.world = world;
    const root = document.getElementById('hud') as HTMLElement;
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- top bar
    const top = el('div', 'topbar', root);
    const fac = world.players[0].faction;
    el('span', 'faction', top).textContent = FACTION_NAMES[fac];
    this.creditsEl = el('span', 'credits', top);
    this.timerEl = el('span', 'timer', top);
    this.opBtn = el('button', 'opbtn', top);
    this.opBtn.addEventListener('click', () => this.ctrl?.toggleOpMode());

    // --- right column: minimap + queues
    const right = el('div', 'right', root);
    const mmWrap = el('div', 'mmwrap', right);
    this.minimap = el('canvas', 'minimap', mmWrap);
    this.minimap.width = 176;
    this.minimap.height = 176;
    const ctx = this.minimap.getContext('2d');
    if (!ctx) throw new Error('minimap context failed');
    this.mmCtx = ctx;
    let mmDrag = false;
    const jump = (e: PointerEvent): void => {
      if (!this.renderer) return;
      const r = this.minimap.getBoundingClientRect();
      const tx = ((e.clientX - r.left) / r.width) * this.world.map.size;
      const ty = ((e.clientY - r.top) / r.height) * this.world.map.size;
      this.renderer.centerOn(tx, ty);
    };
    this.minimap.addEventListener('pointerdown', (e) => {
      mmDrag = true;
      try {
        this.minimap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      jump(e);
    });
    this.minimap.addEventListener('pointermove', (e) => {
      if (mmDrag) jump(e);
    });
    this.minimap.addEventListener('pointerup', () => {
      mmDrag = false;
    });
    this.queueEl = el('div', 'queues', right);

    // --- bottom panel：建筑 / 工事 / 士兵 / 车辆
    const bottom = el('div', 'bottom', root);
    const addBuildCol = (title: string, kinds: BuildingKind[]): HTMLElement => {
      const col = el('div', 'col ' + (title === '建筑' ? 'build' : 'works'), bottom);
      el('h4', undefined, col).textContent = title;
      const row = el('div', 'btns', col);
      for (const kind of kinds) {
        const def = BUILDING_DEFS[kind];
        const b = el('button', 'btn', row);
        b.innerHTML = `<span class="nm">${def.name}</span><span class="cost">${def.cost}</span>`;
        b.title = `${def.desc}。造好后左键放置，右键取消并全额退粮`;
        b.addEventListener('click', () => this.ctrl?.queueBuilding(kind));
        b.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          const ready = this.world.players[0].readyBuilding;
          if (ready === kind || this.ctrl?.placing === kind) this.ctrl?.refundReady();
        });
        this.buildBtns.set(kind, b);
      }
      return row;
    };
    const buildRow = addBuildCol('建筑', STRUCTURES);

    this.placeBtn = el('button', 'btn place', buildRow);
    this.placeBtn.innerHTML = '<span class="nm">放置</span>';
    this.placeBtn.title = '放下已造好的建筑。右键取消并全额退粮';
    this.placeBtn.addEventListener('click', () => this.ctrl?.startPlacing());
    this.placeBtn.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      this.ctrl?.refundReady();
    });

    this.deployBtn = el('button', 'btn deploy', buildRow);
    this.deployBtn.innerHTML = '<span class="nm">立旗</span><span class="cost">F</span>';
    this.deployBtn.title = '选中军旗后按 F，就地立旗建营';
    this.deployBtn.addEventListener('click', () => this.ctrl?.deploySelected());

    this.sellBtn = el('button', 'btn sell', buildRow);
    this.sellBtn.innerHTML = '<span class="nm">出售</span><span class="cost">退 50%</span>';
    this.sellBtn.title = '选中已建成的建筑后出售';
    this.sellBtn.addEventListener('click', () => this.ctrl?.sellSelected());

    addBuildCol('工事', WORKS);

    const soldierCol = el('div', 'col soldiers', bottom);
    el('h4', undefined, soldierCol).textContent = '士兵';
    const vehicleCol = el('div', 'col vehicles', bottom);
    el('h4', undefined, vehicleCol).textContent = '车辆';
    const soldierRow = el('div', 'btns', soldierCol);
    const vehicleRow = el('div', 'btns', vehicleCol);
    const soldiers: UnitKind[] = fac === 'chu'
      ? ['scout', 'bingzu', 'qingqi', 'gongjiang', 'chu_zidi']
      : ['scout', 'bingzu', 'qingqi', 'gongjiang', 'han_caiguan'];
    const vehicles: UnitKind[] = ['zhanche', 'zhuangche', 'weixiuche', 'grainCart'];
    const addUnit = (row: HTMLElement, kind: UnitKind): void => {
      const def = UNIT_DEFS[kind];
      const b = el('button', 'btn', row);
      b.innerHTML = `<span class="nm">${def.name}</span><span class="cost">${def.cost}</span>`;
      if (kind === 'chu_zidi' || kind === 'han_caiguan') b.classList.add('special');
      b.title = def.desc;
      b.addEventListener('click', () => this.ctrl?.queueUnit(kind));
      b.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.ctrl?.cancelUnit();
      });
      this.unitBtns.set(kind, b);
    };
    for (const kind of soldiers) addUnit(soldierRow, kind);
    for (const kind of vehicles) addUnit(vehicleRow, kind);

    const infoCol = el('div', 'col grow', bottom);
    this.infoEl = el('div', 'info', infoCol);

    // --- toast + end overlay
    this.toastEl = el('div', 'toast', root);
    this.overlay = el('div', 'overlay hidden', root);
  }

  attach(ctrl: Controller, renderer: Renderer): void {
    this.ctrl = ctrl;
    this.renderer = renderer;
  }

  // --------------------------------------------------------------- dynamic

  tick(): void {
    this.creditsEl.textContent = `粮草 ${Math.round(this.world.players[0].credits)}`;
    const t = Math.floor(this.world.gameSeconds);
    const m = Math.floor(t / 60);
    const s = t % 60;
    this.timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (this.toastLife > 0) {
      this.toastLife -= 1;
      if (this.toastLife <= 0) this.toastEl.classList.remove('show');
    }
    this.frameCount++;
    if (this.frameCount % 8 === 0) {
      this.drawMinimap();
      this.updateButtons();
    }
  }

  refresh(): void {
    this.updateButtons();
    this.updateInfo();
  }

  private updateButtons(): void {
    const p = this.world.players[0];
    const hasYard = this.world.hasBuilding(0, 'daying');
    for (const [kind, btn] of this.buildBtns) {
      const def = BUILDING_DEFS[kind as BuildingKind];
      const locked = !!def.requires && !this.world.hasBuilding(0, def.requires);
      const isReady = p.readyBuilding === kind;
      btn.disabled = !hasYard || (isReady ? false : locked || !!p.readyBuilding || p.credits < def.cost);
      btn.classList.toggle('ready', isReady);
    }
    for (const [kind, btn] of this.unitBtns) {
      const def = UNIT_DEFS[kind as UnitKind];
      const hasProducer = !!this.world.findProducer(0, kind as UnitKind);
      btn.disabled = p.credits < def.cost || !hasProducer;
    }
    this.placeBtn.style.display = p.readyBuilding ? '' : 'none';

    let hasMcv = false;
    if (this.ctrl) {
      for (const id of this.ctrl.selection) {
        const u = this.world.unitById.get(id);
        if (u && u.kind === 'mcv') {
          hasMcv = true;
          break;
        }
      }
    }
    this.deployBtn.style.display = hasMcv ? '' : 'none';
    this.sellBtn.style.display = this.ctrl && this.ctrl.selectedBuilding !== null ? '' : 'none';
    this.opBtn.textContent = this.ctrl?.leftClickOrders ? '左键下令' : '右键下令';
    this.opBtn.title = '切换操作方式（红警式左键下令 / 传统右键下令）';

    // queues
    this.queueEl.innerHTML = '';
    const addQueue = (label: string, items: { kind: string; progress: number; buildTime: number }[], onCancel: () => void) => {
      for (const it of items) {
        const name =
          it.kind in UNIT_DEFS
            ? UNIT_DEFS[it.kind as UnitKind].name
            : BUILDING_DEFS[it.kind as BuildingKind].name;
        const row = el('div', 'qrow', this.queueEl);
        el('span', 'qname', row).textContent = name;
        const bar = el('div', 'qbar', row);
        const fill = el('i', undefined, bar);
        fill.style.width = `${Math.min(100, (it.progress / it.buildTime) * 100)}%`;
        const x = el('button', 'qx', row);
        x.textContent = '×';
        x.addEventListener('click', onCancel);
      }
    };
    addQueue('单位', this.world.players[0].unitQueue as never, () => this.ctrl?.cancelUnit());
    addQueue('建筑', this.world.players[0].buildingQueue as never, () => this.ctrl?.cancelBuilding());
    if (p.readyBuilding) {
      const row = el('div', 'qready', this.queueEl);
      const txt = el('span', undefined, row);
      txt.textContent = `${BUILDING_DEFS[p.readyBuilding].name} 已就绪 · 左键放置，右键取消`;
      txt.style.flex = '1';
      txt.addEventListener('click', () => this.ctrl?.startPlacing());
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.ctrl?.refundReady();
      });
      const cancel = el('button', 'qx', row);
      cancel.textContent = '×';
      cancel.title = '取消并全额退款';
      cancel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.ctrl?.cancelBuilding();
      });
    }
  }

  private updateInfo(): void {
    const ctrl = this.ctrl;
    if (!ctrl) return;
    if (ctrl.selectedBuilding !== null) {
      const b = this.world.buildingById.get(ctrl.selectedBuilding);
      if (b) {
        this.infoEl.innerHTML = `<b>${BUILDING_DEFS[b.kind].name}</b> ${Math.round(b.hp)}/${b.maxHp}<br><span class="dim">右键设置集结点</span>`;
        return;
      }
    }
    const sel = [...ctrl.selection];
    if (sel.length === 0) {
      this.infoEl.innerHTML = '<span class="dim">左键框选 · 右键下令 · 中键或空格+左键拖动地图 · 鼠标推边滚屏 · 小地图可拖动</span>';
      return;
    }
    const counts = new Map<string, number>();
    for (const id of sel) {
      const u = this.world.unitById.get(id);
      if (!u) continue;
      counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
    }
    const parts = [...counts.entries()].map(([k, n]) => `${UNIT_DEFS[k as UnitKind].name}×${n}`);
    this.infoEl.innerHTML = `<b>已选 ${sel.length}</b><br>${parts.join(' · ')}`;
  }

  private drawMinimap(): void {
    const g = this.mmCtx;
    const S = this.world.map.size;
    const W = this.minimap.width;
    const step = W / S;
    g.clearRect(0, 0, W, W);
    const map = this.world.map;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const t = map.terrain[map.idx(x, y)];
        let c = '#3c5a30';
        if (t === 2) c = '#1d3850';
        else if (t === 3) c = '#44444d';
        else if (t === 1) c = '#5b4b34';
        if (map.ore[map.idx(x, y)] > 0) c = '#8a7429';
        if (!this.world.tileExplored(0, x, y)) c = '#070a08';
        else if (!this.world.tileVisible(0, x, y)) c = '#1a221c';
        g.fillStyle = c;
        g.fillRect(x * step, y * step, step + 0.5, step + 0.5);
      }
    }
    for (const b of this.world.buildings) {
      if (!this.world.buildingVisible(0, b)) continue;
      g.fillStyle = b.owner === 0 ? '#5b9bd5' : '#d15a4a';
      g.fillRect(b.tx * step, b.ty * step, b.w * step, b.h * step);
    }
    for (const u of this.world.units) {
      if (!this.world.unitVisible(0, u)) continue;
      g.fillStyle = u.owner === 0 ? '#a8d4ff' : '#ff9a8a';
      g.fillRect(u.x * step - 1, u.y * step - 1, 2.5, 2.5);
    }
    if (this.renderer) {
      const r = this.renderer;
      const tl = r.screenToTile(0, 0);
      const br = r.screenToTile(r.screenW, r.screenH);
      g.strokeStyle = 'rgba(255,255,255,0.65)';
      g.lineWidth = 1;
      g.strokeRect(tl.x * step, tl.y * step, (br.x - tl.x) * step, (br.y - tl.y) * step);
    }
  }

  // --------------------------------------------------------------- events

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastLife = 90;
  }

  gameOver(win: boolean): void {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="card"><h2>${win ? '大破楚军' : '大营失守'}</h2>
      <p>${win ? '汉军胜' : '楚军胜'}</p>
      <button onclick="location.reload()">再来一局</button></div>`;
  }
}
