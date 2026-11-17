// PixiJS presentation layer. Reads the simulation, never mutates it.

import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { T_DIRT, T_GRASS, T_ROCK, T_WATER } from '../sim/map.js';
import { BUILDING_DEFS, UNIT_DEFS } from '../sim/stats.js';
import type { World } from '../sim/world.js';
import { isoX, isoY, screenToTile, tileDiamond, TILE_H, TILE_W } from './iso.js';
import { sfxBoom, sfxBuilt, sfxShot } from '../ui/sfx.js';
import type { TileCoord } from './iso.js';
import { buildTextures, TERRAIN_COLOR } from './textures.js';
import type { TextureSet } from './textures.js';

interface Effect {
  kind: 'tracer' | 'boom';
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  max: number;
}

export class Renderer {
  readonly app: Application;
  readonly world: Container;
  readonly tex: TextureSet;
  zoom = 1.0;
  cam: TileCoord = { x: 24, y: 24 };
  selection: Set<number> = new Set();
  selectionBuilding: number | null = null;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
  ghost: { tx: number; ty: number; w: number; h: number; ok: boolean } | null = null;
  wallCells: { tx: number; ty: number; ok: boolean }[] | null = null;
  /** 红警目标线：每个单位连到自己当前的移动点或攻击目标。 */
  orderLine: { x: number; y: number; tx: number; ty: number; attack: boolean }[] | null = null;

  private terrain = new Container();
  private fog = new Graphics();
  private entities = new Container();
  private labels = new Container();
  private overlay = new Graphics();
  private screenOverlay = new Graphics();
  private unitSprites = new Map<number, Sprite>();
  /** Last pose, so walk frames and facing don't flicker on the boundary. */
  private unitPose = new Map<number, { x: number; y: number; flip: boolean; back: boolean }>();
  private corpses: { spr: Sprite; life: number; flip: boolean }[] = [];
  private buildingSprites = new Map<number, Sprite>();
  private buildingLabels = new Map<number, Text>();
  private effects: Effect[] = [];
  private sim: World;

  static async create(canvasHost: HTMLElement, sim: World): Promise<Renderer> {
    const app = new Application();
    await app.init({
      background: '#0d1210',
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    canvasHost.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    return new Renderer(app, sim);
  }

  private constructor(app: Application, sim: World) {
    this.app = app;
    this.sim = sim;
    this.tex = buildTextures(app.renderer, unitKindsFor(sim), 0);

    this.world = new Container();
    this.entities.sortableChildren = true;
    this.world.addChild(this.terrain, this.fog, this.entities, this.labels, this.overlay);
    app.stage.addChild(this.world, this.screenOverlay);

    this.buildTerrain();
    this.cam = { x: 24, y: 24 };
  }

  // ------------------------------------------------------------- terrain

  private buildTerrain(): void {
    const map = this.sim.map;
    const buckets = new Map<number, number[]>();
    const push = (color: number, poly: number[]) => {
      let arr = buckets.get(color);
      if (!arr) {
        arr = [];
        buckets.set(color, arr);
      }
      arr.push(...poly);
    };

    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        const t = map.terrain[map.idx(x, y)];
        const poly = tileDiamond(x, y);
        let color = TERRAIN_COLOR.grass;
        if (t === T_DIRT) color = TERRAIN_COLOR.dirt;
        else if (t === T_WATER) color = TERRAIN_COLOR.water;
        else if (t === T_ROCK) color = TERRAIN_COLOR.rock;
        push(color, poly);
      }
    }

    for (const [color, pts] of buckets) {
      const g = new Graphics();
      for (let i = 0; i < pts.length; i += 8) {
        g.poly(pts.slice(i, i + 8)).fill({ color });
      }
      this.terrain.addChild(g);
    }

    // very subtle per-tile tint variation (cheap: batched fills, no per-tile strokes)
    const tint = new Graphics();
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        if ((x * 7 + y * 13) % 5 !== 0) continue;
        tint.poly(tileDiamond(x, y)).fill({ color: 0x0a140c, alpha: 0.05 });
      }
    }
    this.terrain.addChild(tint);

    // farmland (ore) patches
    const ore = new Graphics();
    let any = false;
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        const amount = map.ore[map.idx(x, y)];
        if (amount <= 0) continue;
        any = true;
        const cx = isoX(x + 0.5, y + 0.5);
        const cy = isoY(x + 0.5, y + 0.5);
        ore
          .poly([
            cx, cy - 10, cx + 18, cy, cx, cy + 10, cx - 18, cy,
          ])
          .fill({ color: TERRAIN_COLOR.ore, alpha: 0.28 + Math.min(0.4, amount / 9000) });
        ore.moveTo(cx - 8, cy - 2).lineTo(cx + 8, cy + 2).stroke({ width: 1.5, color: 0xd8c25a, alpha: 0.5 });
      }
    }
    if (any) this.terrain.addChild(ore);

    // water shimmer lines
    const waves = new Graphics();
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        if (map.terrain[map.idx(x, y)] !== T_WATER) continue;
        const cx = isoX(x + 0.5, y + 0.5);
        const cy = isoY(x + 0.5, y + 0.5);
        waves.moveTo(cx - 8, cy).lineTo(cx + 8, cy).stroke({ width: 1.5, color: 0x4f7fa8, alpha: 0.35 });
      }
    }
    this.terrain.addChild(waves);
  }

  // ------------------------------------------------------------- camera

  get screenW(): number {
    return this.app.screen.width;
  }

  get screenH(): number {
    return this.app.screen.height;
  }

  applyCamera(): void {
    this.zoom = Math.min(1.8, Math.max(0.45, this.zoom));
    this.world.scale.set(this.zoom);
    this.world.x = this.screenW / 2 - isoX(this.cam.x, this.cam.y) * this.zoom;
    this.world.y = this.screenH / 2 - isoY(this.cam.x, this.cam.y) * this.zoom;
  }

  /** 按屏幕像素量移动画面内容：正数表示地图内容向右/向下移动。 */
  panScreen(dx: number, dy: number): void {
    const ndx = dx / ((TILE_W / 2) * this.zoom);
    const ndy = dy / ((TILE_H / 2) * this.zoom);
    this.cam.x -= (ndx + ndy) / 2;
    this.cam.y += (ndx - ndy) / 2;
    this.clampCam();
  }

  clampCam(): void {
    const S = this.sim.map.size;
    this.cam.x = Math.min(S, Math.max(0, this.cam.x));
    this.cam.y = Math.min(S, Math.max(0, this.cam.y));
  }

  centerOn(x: number, y: number): void {
    this.cam.x = x;
    this.cam.y = y;
    this.clampCam();
    this.applyCamera();
  }

  screenToTile(sx: number, sy: number): TileCoord {
    const wx = (sx - this.world.x) / this.zoom;
    const wy = (sy - this.world.y) / this.zoom;
    return screenToTile(wx, wy);
  }

  /** Screen position of a point on the ground, in CSS pixels. */
  tileToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: isoX(x, y) * this.zoom + this.world.x,
      y: isoY(x, y) * this.zoom + this.world.y,
    };
  }

  // ------------------------------------------------------------- frame

  pushEvents(): void {
    let shot = false;
    for (const e of this.sim.events) {
      if (e.t === 'built' && e.owner === 0) sfxBuilt();
      if (!this.sim.tileVisible(0, e.x, e.y)) continue;
      if (e.t === 'shot') {
        if (!shot) sfxShot();
        shot = true;
        this.effects.push({ kind: 'tracer', x: e.x, y: e.y, tx: e.tx, ty: e.ty, life: 0.12, max: 0.12 });
      } else if (e.t === 'die') {
        sfxBoom();
        this.effects.push({ kind: 'boom', x: e.x, y: e.y, tx: e.x, ty: e.y, life: 0.45, max: 0.45 });
      }
    }
    this.sim.events.length = 0;
  }

  draw(dt: number): void {
    this.applyCamera();
    this.drawFog();
    this.syncUnits();
    this.syncBuildings();
    this.drawOverlay();
    this.drawMarquee();
    this.updateCorpses(dt);
    this.updateEffects(dt);
  }

  private drawMarquee(): void {
    const g = this.screenOverlay;
    g.clear();
    const mq = this.marquee;
    if (!mq) return;
    const x0 = Math.min(mq.x0, mq.x1);
    const x1 = Math.max(mq.x0, mq.x1);
    const y0 = Math.min(mq.y0, mq.y1);
    const y1 = Math.max(mq.y0, mq.y1);
    if (x1 - x0 < 3 && y1 - y0 < 3) return;
    g.rect(x0, y0, x1 - x0, y1 - y0)
      .fill({ color: 0x8ef7a8, alpha: 0.1 })
      .stroke({ width: 1.5, color: 0xa6ffc0, alpha: 0.95 });
  }

  private drawFog(): void {
    const g = this.fog;
    g.clear();
    const map = this.sim.map;
    const S = map.size;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (this.sim.tileVisible(0, x, y)) continue;
        const known = this.sim.tileExplored(0, x, y);
        g.poly(tileDiamond(x, y)).fill({ color: 0x050806, alpha: known ? 0.58 : 1 });
      }
    }
  }

  private syncUnits(): void {
    const seen = new Set<number>();
    for (const u of this.sim.units) {
      if (!this.sim.unitVisible(0, u)) continue;
      seen.add(u.id);
      const pose = this.unitPose.get(u.id);
      const screenX = Math.cos(u.facing) - Math.sin(u.facing);
      const screenY = Math.cos(u.facing) + Math.sin(u.facing);
      let flip = pose?.flip ?? screenX < 0;
      let back = pose?.back ?? screenY < 0;
      if (screenX > 0.35) flip = false;
      else if (screenX < -0.35) flip = true;
      if (screenY > 0.35) back = false;
      else if (screenY < -0.35) back = true;
      const moved = pose ? Math.hypot(u.x - pose.x, u.y - pose.y) > 0.008 : false;
      this.unitPose.set(u.id, { x: u.x, y: u.y, flip, back });

      const heavy = u.kind === 'zhanche' || u.kind === 'zhuangche' || u.kind === 'weixiuche' || u.kind === 'grainCart';
      const period = u.kind === 'qingqi' ? 160 : heavy ? 280 : 210;
      const attacking = u.order === 'attack' && !moved && UNIT_DEFS[u.kind].weapon !== null;
      const frame = attacking ? 2 : moved ? Math.floor(performance.now() / period) % 2 : 0;
      const dir = back ? 'ne' : 'se';
      const baked = this.tex.units.get(`${u.kind}:${u.owner}:${dir}:${frame}`);
      if (!baked) continue;

      let spr = this.unitSprites.get(u.id);
      if (!spr) {
        spr = new Sprite(baked.texture);
        this.entities.addChild(spr);
        this.unitSprites.set(u.id, spr);
      }
      if (spr.texture !== baked.texture) spr.texture = baked.texture;
      spr.anchor.set(baked.ax, baked.ay);
      const s = 1.4;
      spr.scale.set(flip ? -s : s, s);
      spr.position.set(isoX(u.x, u.y), isoY(u.x, u.y));
      spr.zIndex = u.x + u.y + 0.01;
    }
    for (const [id, spr] of this.unitSprites) {
      if (!seen.has(id)) {
        const u = this.sim.unitById.get(id);
        if (u && u.alive) spr.destroy();
        else this.corpses.push({ spr, life: 0.42, flip: spr.scale.x < 0 });
        this.unitSprites.delete(id);
        this.unitPose.delete(id);
      }
    }
  }

  private updateCorpses(dt: number): void {
    const stay: { spr: Sprite; life: number; flip: boolean }[] = [];
    for (const c of this.corpses) {
      c.life -= dt;
      if (c.life <= 0) {
        c.spr.destroy();
        continue;
      }
      const t = c.life / 0.42;
      const s = 1.4 * (0.45 + 0.55 * t);
      c.spr.alpha = t;
      c.spr.scale.set(c.flip ? -s : s, s * (0.55 + 0.45 * t));
      stay.push(c);
    }
    this.corpses = stay;
  }

  private syncBuildings(): void {
    const seen = new Set<number>();
    for (const b of this.sim.buildings) {
      if (!this.sim.buildingVisible(0, b)) continue;
      seen.add(b.id);
      const key = b.kind === 'juma' ? `juma:${b.owner}:${this.jumaMask(b)}` : `${b.kind}:${b.owner}`;
      const baked = this.tex.buildings.get(key);
      if (!baked) continue;
      let spr = this.buildingSprites.get(b.id);
      if (!spr) {
        spr = new Sprite(baked.texture);
        spr.anchor.set(baked.ax, baked.ay);
        spr.scale.set(0.92);
        this.entities.addChild(spr);
        this.buildingSprites.set(b.id, spr);

        if (b.kind !== 'juma') {
          const label = new Text({
            text: BUILDING_DEFS[b.kind].name,
            style: {
              fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif',
              fontSize: 13,
              fill: 0xefe6d2,
              stroke: { color: 0x0b0f0c, width: 3 },
            },
          });
          label.anchor.set(0.5, 0);
          this.labels.addChild(label);
          this.buildingLabels.set(b.id, label);
        }
      }
      if (spr.texture !== baked.texture) {
        spr.texture = baked.texture;
        spr.anchor.set(baked.ax, baked.ay);
      }
      spr.position.set(isoX(b.x, b.y), isoY(b.x, b.y));
      spr.zIndex = b.x + b.y - 0.01;

      const label = this.buildingLabels.get(b.id);
      if (label) {
        const hh = ((b.w + b.h) * TILE_H) / 4;
        label.position.set(isoX(b.x, b.y), isoY(b.x, b.y) + hh * 0.92 + 28);
      }
    }
    for (const [id, spr] of this.buildingSprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.buildingSprites.delete(id);
      }
    }
    for (const [id, label] of this.buildingLabels) {
      if (!seen.has(id)) {
        label.destroy();
        this.buildingLabels.delete(id);
      }
    }
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();

    if (this.orderLine) {
      for (const line of this.orderLine) {
        const ax = isoX(line.x, line.y);
        const ay = isoY(line.x, line.y);
        const bx = isoX(line.tx, line.ty);
        const by = isoY(line.tx, line.ty);
        const color = line.attack ? 0xff5d4a : 0x9dff6a;
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 4, color: 0x101610, alpha: 0.75 });
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2, color, alpha: 0.95 });
        g.circle(bx, by, 4.5).stroke({ width: 2, color, alpha: 0.95 });
      }
    }

    if (this.wallCells) {
      for (const cell of this.wallCells) {
        const color = cell.ok ? 0x7ef2a0 : 0xff6b5a;
        g.poly(tileDiamond(cell.tx, cell.ty)).fill({ color, alpha: 0.28 });
        g.poly(tileDiamond(cell.tx, cell.ty)).stroke({ width: 1.5, color, alpha: 0.9 });
      }
    }

    // building placement preview
    if (this.ghost) {
      const { tx, ty, w, h, ok } = this.ghost;
      const color = ok ? 0x7ef2a0 : 0xff6b5a;
      for (let y = ty; y < ty + h; y++) {
        for (let x = tx; x < tx + w; x++) {
          g.poly(tileDiamond(x, y)).fill({ color, alpha: 0.2 });
        }
      }
      const quad: number[] = [];
      const corners: Array<[number, number]> = [
        [tx, ty], [tx + w, ty], [tx + w, ty + h], [tx, ty + h],
      ];
      for (const [cx, cy] of corners) {
        quad.push(isoX(cx, cy), isoY(cx, cy));
      }
      g.poly(quad).stroke({ width: 2, color, alpha: 0.9 });
    }

    // selection rings
    for (const id of this.selection) {
      const u = this.sim.unitById.get(id);
      if (!u || !u.alive) continue;
      const cx = isoX(u.x, u.y);
      const cy = isoY(u.x, u.y) + 2;
      const r = Math.max(13, UNIT_DEFS[u.kind].radius * 46);
      g.ellipse(cx, cy, r, r * 0.52).fill({ color: 0x8ef7a8, alpha: 0.16 });
      g.ellipse(cx, cy, r, r * 0.52).stroke({ width: 2.4, color: 0xa6ffc0, alpha: 1 });
      // little marker so it stays readable when units overlap
      g.rect(cx - 1.5, cy - r * 0.52 - 13, 3, 8).fill({ color: 0xa6ffc0, alpha: 0.95 });

      // queued waypoints
      for (const wp of u.waypoints) {
        const wx = isoX(wp.x, wp.y);
        const wy = isoY(wp.x, wp.y);
        g.circle(wx, wy, 4.5).fill({ color: 0xa6ffc0, alpha: 0.55 });
        g.circle(wx, wy, 4.5).stroke({ width: 1.5, color: 0xe6ffe9, alpha: 0.9 });
      }
    }

    // selected building outline
    if (this.selectionBuilding !== null) {
      const b = this.sim.buildingById.get(this.selectionBuilding);
      if (b) {
        const quad: number[] = [];
        const corners: Array<[number, number]> = [
          [b.tx, b.ty], [b.tx + b.w, b.ty], [b.tx + b.w, b.ty + b.h], [b.tx, b.ty + b.h],
        ];
        for (const [cx, cy] of corners) quad.push(isoX(cx, cy), isoY(cx, cy));
        g.poly(quad).fill({ color: 0x8ef7a8, alpha: 0.1 });
        g.poly(quad).stroke({ width: 2.5, color: 0xa6ffc0, alpha: 0.95 });
      }
    }

    // health bars
    for (const u of this.sim.units) {
      if (u.hp >= u.maxHp || !this.sim.unitVisible(0, u)) continue;
      this.healthBar(g, u.x, u.y, u.hp / u.maxHp, 26, 54);
    }
    for (const b of this.sim.buildings) {
      if (!this.sim.buildingVisible(0, b)) continue;
      this.healthBar(g, b.x, b.y, b.hp / b.maxHp, ((b.w + b.h) * TILE_W) / 4);
    }
  }

  private jumaMask(b: { tx: number; ty: number; owner: number }): number {
    const has = (tx: number, ty: number): boolean => {
      for (const o of this.sim.buildings) {
        if (!o.alive || o.kind !== 'juma' || o.owner !== b.owner) continue;
        if (o.tx === tx && o.ty === ty) return true;
      }
      return false;
    };
    let mask = 0;
    if (has(b.tx, b.ty - 1)) mask |= 1;
    if (has(b.tx + 1, b.ty)) mask |= 2;
    if (has(b.tx, b.ty + 1)) mask |= 4;
    if (has(b.tx - 1, b.ty)) mask |= 8;
    return mask;
  }

  private healthBar(g: Graphics, x: number, y: number, ratio: number, width: number, lift = 30): void {
    const cx = isoX(x, y);
    const cy = isoY(x, y) - lift;
    const w = width;
    const h = 4;
    g.rect(cx - w / 2, cy, w, h).fill({ color: 0x000000, alpha: 0.65 });
    const col = ratio > 0.55 ? 0x62c46a : ratio > 0.28 ? 0xd8b64a : 0xd1493f;
    g.rect(cx - w / 2 + 1, cy + 1, Math.max(0, (w - 2) * ratio), h - 2).fill({ color: col, alpha: 0.95 });
  }

  private updateEffects(dt: number): void {
    const g = this.overlay;
    for (const e of this.effects) {
      e.life -= dt;
      const t = Math.max(0, e.life / e.max);
      if (e.kind === 'tracer') {
        const ax = isoX(e.x, e.y);
        const ay = isoY(e.x, e.y) - 14;
        const bx = isoX(e.tx, e.ty);
        const by = isoY(e.tx, e.ty) - 14;
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1.6, color: 0xffe6a0, alpha: t * 0.9 });
      } else {
        const cx = isoX(e.x, e.y);
        const cy = isoY(e.x, e.y) - 8;
        const r = 10 + (1 - t) * 26;
        g.circle(cx, cy, r).fill({ color: 0xff9b4a, alpha: t * 0.35 });
        g.circle(cx, cy, r * 0.6).fill({ color: 0xffe1a0, alpha: t * 0.5 });
      }
    }
    this.effects = this.effects.filter((e) => e.life > 0);
  }
}

function unitKindsFor(world: World): import('../sim/types.js').UnitKind[] {
  const set = new Set<import('../sim/types.js').UnitKind>();
  for (const u of world.units) set.add(u.kind);
  for (const k of ['mcv', 'scout', 'bingzu', 'qingqi', 'gongjiang', 'han_caiguan', 'chu_zidi', 'zhanche', 'zhuangche', 'weixiuche', 'grainCart'] as const) {
    set.add(k);
  }
  return [...set];
}
