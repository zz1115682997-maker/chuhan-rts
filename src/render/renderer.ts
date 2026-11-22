// PixiJS presentation layer. Reads the simulation, never mutates it.

import { Application, Assets, CanvasSource, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
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

/** 读一张图，用于往 canvas 上烘焙地表。 */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(src));
    img.src = src;
  });
}

/** 稳定的逐格伪随机，保证每次刷新同一格的花纹/装饰一致。 */
function tileHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
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
  /** 纯色兜底层：真实地表烘焙好后淡出。 */
  private flatTerrain: Graphics[] = [];
  private fog = new Graphics();
  /** 外部立绘单位没有自带投影，影子单独画在这一层（在单位之下）。 */
  private unitShadows = new Graphics();
  private entities = new Container();
  private labels = new Container();
  private overlay = new Graphics();
  private screenOverlay = new Graphics();
  private unitSprites = new Map<number, Sprite>();
  /** Last pose, so walk frames and facing don't flicker on the boundary. */
  private unitPose = new Map<number, { x: number; y: number; flip: boolean; back: boolean }>();
  private corpses: { spr: Sprite; life: number; flip: boolean }[] = [];
  /** 攻击帧保持到什么时候（毫秒），避免贴身打建筑时帧间闪跳。 */
  private atkHold = new Map<number, number>();
  private buildingSprites = new Map<number, Sprite>();
  private buildingLabels = new Map<number, Text>();
  private effects: Effect[] = [];
  private wallTip: Text | null = null;
  private walkFrames = location.search.includes('walk=1');
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

    // ?noart=1 退回全代码画法；?artscale=0.30 手动调屏幕高度。
    const q = new URLSearchParams(location.search);
    let art: Map<string, Texture[]> | undefined;
    let artBack: Map<string, Texture> | undefined;
    let bArt: Map<string, Texture> | undefined;
    let artScale: number | undefined;
    if (!q.has('noart')) {
      try {
        art = new Map<string, Texture[]>();
        artBack = new Map<string, Texture>();
        // 帧位固定：0 站立、1 迈步、2 攻击。缺哪张就回落到站立，索引不能错位。
        const loadPair = async (kind: string, stand: string, walk?: string, atk?: string): Promise<void> => {
          const pair: Texture[] = [await Assets.load(stand)];
          if (walk) {
            try {
              pair.push(await Assets.load(walk));
            } catch {
              /* 缺迈步帧就退化成单帧 */
            }
          }
          if (pair.length < 2) pair.push(pair[0]);
          if (atk) {
            try {
              pair[2] = await Assets.load(atk);
            } catch {
              pair[2] = pair[0];
            }
          }
          art!.set(kind, pair);
        };
        try {
          await loadPair('bingzu', '/assets/units/bingzu_c.png', '/assets/units/bingzu_c_walk.png', '/assets/units/bingzu_c_atk.png');
          await loadPair('scout', '/assets/units/scout.png', '/assets/units/scout_walk.png', '/assets/units/scout_atk.png');
          await loadPair('gongjiang', '/assets/units/gongjiang.png', '/assets/units/gongjiang_walk.png', '/assets/units/gongjiang_atk.png');
          await loadPair('han_caiguan', '/assets/units/han_caiguan.png', '/assets/units/han_caiguan_walk.png', '/assets/units/han_caiguan_atk.png');
          await loadPair('chu_zidi', '/assets/units/chu_zidi.png', '/assets/units/chu_zidi_walk.png', '/assets/units/chu_zidi_atk.png');
          await loadPair('qingqi', '/assets/units/qingqi.png', '/assets/units/qingqi_walk.png', '/assets/units/qingqi_atk.png');
          await loadPair('grainCart', '/assets/units/grainCart_v.png');
          await loadPair('zhanche', '/assets/units/zhanche_v.png', undefined, '/assets/units/zhanche_atk.png');
          await loadPair('zhuangche', '/assets/units/zhuangche_v.png', undefined, '/assets/units/zhuangche_atk.png');
          await loadPair('weixiuche', '/assets/units/weixiuche_v.png', undefined, '/assets/units/weixiuche_atk.png');
          await loadPair('mcv', '/assets/units/mcv_v.png');
          const loadBack = async (kind: string, url: string): Promise<void> => {
            try {
              artBack!.set(kind, await Assets.load(url));
            } catch {
              /* 缺背面图就继续用正面 */
            }
          };
          await loadBack('bingzu', '/assets/units/bingzu_c_back.png');
          await loadBack('scout', '/assets/units/scout_back.png');
          await loadBack('gongjiang', '/assets/units/gongjiang_back.png');
          await loadBack('han_caiguan', '/assets/units/han_caiguan_back.png');
          await loadBack('chu_zidi', '/assets/units/chu_zidi_back.png');
          await loadBack('qingqi', '/assets/units/qingqi_back.png');
        } catch (err) {
          console.warn('[art] 部分立绘缺失，保留代码画法', err);
        }
        bArt = new Map<string, Texture>();
        for (const k of ['nutai', 'canglin', 'daying', 'bingying', 'chemafang', 'fengjiantai']) {
          try {
            bArt.set(k, await Assets.load(`/assets/units/${k}_art.png`));
          } catch {
            /* 缺图就退回代码画法 */
          }
        }
        const ns = Number(q.get('artscale'));
        if (Number.isFinite(ns) && ns > 0) artScale = ns;
      } catch (err) {
        console.warn('[art] 立绘加载失败，回退代码画法', err);
        art = undefined;
        bArt = undefined;
      }
    }

    return new Renderer(app, sim, art, bArt, artScale, artBack);
  }

  private constructor(
    app: Application,
    sim: World,
    art?: Map<string, Texture[]>,
    buildingArt?: Map<string, Texture>,
    artScale?: number,
    backArt?: Map<string, Texture>,
  ) {
    this.app = app;
    this.sim = sim;
    this.tex = buildTextures(app.renderer, unitKindsFor(sim), 0, art, buildingArt, backArt);
    if (artScale && art) {
      for (const kind of art.keys()) {
        for (const [k, b] of this.tex.units) {
          if (k.startsWith(kind + ':')) b.scale = artScale;
        }
      }
    }

    this.world = new Container();
    this.entities.sortableChildren = true;
    this.world.addChild(this.terrain, this.fog, this.unitShadows, this.entities, this.labels, this.overlay);
    app.stage.addChild(this.world, this.screenOverlay);

    this.buildTerrainFlat();
    this.buildTerrainArt().catch((err) => console.warn('[terrain] 地表贴图加载失败，保留纯色', err));
    this.cam = { x: 24, y: 24 };
  }

  // ------------------------------------------------------------- terrain

  private buildTerrainFlat(): void {
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
      this.flatTerrain.push(g);
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
    this.flatTerrain.push(tint);

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

  /**
   * 真实地表：把四张俯视纹理按格斜切烘焙成一张大图（一层 sprite，不占 draw call），
   * 再在草地上撒树/石、岩区放石山、水边放芦苇。加载失败就安静退回纯色版本。
   */
  private async buildTerrainArt(): Promise<void> {
    const map = this.sim.map;
    const size = map.size;
    const HW = TILE_W / 2;
    const HH = TILE_H / 2;
    const PAD = 180;
    const cw = size * 2 * HW + PAD * 2;
    const ch = size * 2 * HH + PAD * 2;
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#101511';
    ctx.fillRect(0, 0, cw, ch);

    const ver = '?v=t1';
    const names = ['grass', 'dirt', 'water', 'rock'] as const;
    let imgs: HTMLImageElement[];
    try {
      imgs = await Promise.all(names.map((n) => loadImg(`/assets/terrain/${n}.jpg${ver}`)));
    } catch (err) {
      console.warn('[terrain] 地表贴图缺失，保留纯色', err);
      return;
    }
    const S = 56;
    const maxOff = Math.max(1, imgs[0].width - S);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = map.idx(x, y);
        const t = map.terrain[i];
        let img = imgs[t] ?? imgs[0];
        if (map.ore[i] > 0 && t !== T_WATER) img = imgs[1];
        // 每格从纹理里随机抠一块，避免整张图反复出现同一个图案
        const sx = Math.floor(tileHash(x, y, 11) * maxOff);
        const sy = Math.floor(tileHash(x, y, 23) * maxOff);
        const dx = PAD + size * HW + (x - y) * HW;
        const dy = PAD + (x + y) * HH;
        ctx.setTransform(HW / S, HH / S, -HW / S, HH / S, dx, dy);
        ctx.drawImage(img, sx, sy, S, S, 0, 0, S, S);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 装饰物选址
    const terrainAt = (x: number, y: number): number =>
      x >= 0 && y >= 0 && x < size && y < size ? map.terrain[map.idx(x, y)] : -1;
    const decos: { x: number; y: number; name: 'tree' | 'stones' | 'hill' | 'reeds' }[] = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = map.idx(x, y);
        const t = map.terrain[i];
        if (map.ore[i] > 0 || map.occupied[i] !== 0) continue;
        const h = tileHash(x, y, 37);
        if (t === T_GRASS) {
          if (h < 0.05) decos.push({ x, y, name: 'tree' });
          else if (h < 0.068) decos.push({ x, y, name: 'stones' });
          else if (
            h > 0.95 &&
            (terrainAt(x + 1, y) === T_WATER ||
              terrainAt(x - 1, y) === T_WATER ||
              terrainAt(x, y + 1) === T_WATER ||
              terrainAt(x, y - 1) === T_WATER)
          ) {
            decos.push({ x, y, name: 'reeds' });
          }
        } else if (t === T_ROCK) {
          const nb =
            (terrainAt(x + 1, y) === T_ROCK ? 1 : 0) +
            (terrainAt(x - 1, y) === T_ROCK ? 1 : 0) +
            (terrainAt(x, y + 1) === T_ROCK ? 1 : 0) +
            (terrainAt(x, y - 1) === T_ROCK ? 1 : 0);
          if (nb >= 3 && h > 0.82) decos.push({ x, y, name: 'hill' });
          else if (h > 0.76) decos.push({ x, y, name: 'stones' });
        }
      }
    }

    // 影子直接画进烘焙图，省一层 sprite
    for (const d of decos) {
      const cx = PAD + size * HW + (d.x - d.y) * HW;
      const cy = PAD + (d.x + d.y + 1) * HH + 4;
      const rx = d.name === 'tree' ? 26 : d.name === 'hill' ? 36 : 15;
      const ry = rx * 0.34;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,14,10,0.24)';
      ctx.fill();
    }

    // 一张 3072×1536 的纹理在部分显卡上会超过 max texture size，切成 1024 的块更保险
    const OFF_X = -(PAD + size * HW);
    const OFF_Y = -PAD;
    const CHUNK = 1024;
    let slot = 0;
    for (let sy = 0; sy < ch; sy += CHUNK) {
      for (let sx = 0; sx < cw; sx += CHUNK) {
        const w = Math.min(CHUNK, cw - sx);
        const h = Math.min(CHUNK, ch - sy);
        const part = document.createElement('canvas');
        part.width = w;
        part.height = h;
        const pctx = part.getContext('2d');
        if (!pctx) continue;
        pctx.drawImage(cv, sx, sy, w, h, 0, 0, w, h);
        const spr = new Sprite(new Texture({ source: new CanvasSource({ resource: part }) }));
        spr.position.set(OFF_X + sx, OFF_Y + sy);
        this.terrain.addChildAt(spr, slot++);
      }
    }
    for (const g of this.flatTerrain) g.alpha = 0;

    let texs: Record<string, Texture>;
    try {
      const [tree, stones, hill, reeds] = await Promise.all([
        Assets.load(`/assets/terrain/tree.png${ver}`),
        Assets.load(`/assets/terrain/stones.png${ver}`),
        Assets.load(`/assets/terrain/hill.png${ver}`),
        Assets.load(`/assets/terrain/reeds.png${ver}`),
      ]);
      texs = { tree, stones, hill, reeds };
    } catch (err) {
      console.warn('[terrain] 装饰贴图缺失，只保留地面', err);
      return;
    }
    for (const d of decos) {
      const tex = texs[d.name];
      if (!tex) continue;
      const spr = new Sprite(tex);
      spr.anchor.set(0.5, 1);
      spr.position.set(isoX(d.x + 0.5, d.y + 0.5), isoY(d.x + 0.5, d.y + 0.5) + 6);
      spr.zIndex = d.x + d.y + 0.9;
      this.entities.addChild(spr);
    }
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
    this.drawUnitShadows();
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

  private drawUnitShadows(): void {
    const g = this.unitShadows;
    g.clear();
    for (const u of this.sim.units) {
      if (!this.sim.unitVisible(0, u)) continue;
      const baked = this.tex.units.get(`${u.kind}:${u.owner}:se:0`);
      // 代码画的贴图自带影子，只有外部立绘需要补一层
      if (!baked || !baked.scale) continue;
      const cx = isoX(u.x, u.y);
      const cy = isoY(u.x, u.y) + 4;
      g.ellipse(cx, cy, 21 * baked.scale, 7.5 * baked.scale).fill({ color: 0x000000, alpha: 0.26 });
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
      // 默认不切帧：两帧立绘的重心对不齐，切起来会闪。改用站立帧 + 轻微起伏。
      // 想回到两帧走路动画，加 ?walk=1。
      // 攻击帧要滞回：贴身打建筑时位置微调会让 attacking 一帧真一帧假，切帧就抖。
      const now = performance.now();
      if (attacking) this.atkHold.set(u.id, now + 520);
      const atk = (this.atkHold.get(u.id) ?? 0) > now;
      const frame = atk ? 2 : this.walkFrames && moved ? Math.floor(now / period) % 2 : 0;
      const bob = moved && !this.walkFrames ? Math.sin(performance.now() / (heavy ? 150 : 105)) * (heavy ? 0.9 : 1.6) : 0;
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
      const s = baked.scale ?? 1.4;
      spr.scale.set(flip ? -s : s, s);
      spr.tint = baked.scale ? (u.owner === 0 ? 0x7fb3e0 : 0xe07a66) : 0xffffff;
      // 立绘脚底在画布第 124 行，再往下压 3px 才有踩实感
      spr.position.set(isoX(u.x, u.y), isoY(u.x, u.y) + (baked.scale ? 3 : 0) + bob);
      spr.zIndex = u.x + u.y + 0.01;
    }
    for (const [id, spr] of this.unitSprites) {
      if (!seen.has(id)) {
        const u = this.sim.unitById.get(id);
        if (u && u.alive) spr.destroy();
        else this.corpses.push({ spr, life: 0.42, flip: spr.scale.x < 0 });
        this.unitSprites.delete(id);
        this.unitPose.delete(id);
        this.atkHold.delete(id);
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

  /** 屏幕坐标命中建筑：按精灵实际包围盒算，点屋顶也能选中，而不是只看地面格 */
  buildingAt(sx: number, sy: number): number | null {
    let best: number | null = null;
    let bestZ = -Infinity;
    for (const [id, spr] of this.buildingSprites) {
      const r = spr.getBounds();
      if (sx < r.x || sx > r.x + r.width || sy < r.y || sy > r.y + r.height) continue;
      if (spr.zIndex > bestZ) {
        bestZ = spr.zIndex;
        best = id;
      }
    }
    return best;
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
        spr.scale.set(baked.scale ?? 0.92);
        if (baked.scale) spr.tint = b.owner === 0 ? 0xd2e2f2 : 0xf2d5cf;
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
      // 立绘底边压在占地菱形的下顶点，比中心再低半格
      const foot = baked.scale ? ((b.w + b.h) * TILE_H) / 4 : 0;
      spr.position.set(isoX(b.x, b.y), isoY(b.x, b.y) + foot);
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

    if (this.wallCells && this.wallCells.length) {
      for (const cell of this.wallCells) {
        const color = cell.ok ? 0x7ef2a0 : 0xff6b5a;
        g.poly(tileDiamond(cell.tx, cell.ty)).fill({ color, alpha: 0.2 });
        g.poly(tileDiamond(cell.tx, cell.ty)).stroke({ width: 1.5, color, alpha: 0.9 });
      }
      // 连成一条线：一眼看出这一排会接成多长，而不是一堆散格子
      const okCells = this.wallCells.filter((c) => c.ok);
      const centers = okCells.map((c) => ({ x: isoX(c.tx + 0.5, c.ty + 0.5), y: isoY(c.tx + 0.5, c.ty + 0.5) }));
      if (centers.length > 1) {
        g.moveTo(centers[0].x, centers[0].y);
        for (let i = 1; i < centers.length; i++) g.lineTo(centers[i].x, centers[i].y);
        g.stroke({ width: 3, color: 0x9bffb0, alpha: 0.9 });
      }
      for (const p of centers) g.circle(p.x, p.y, 3).fill({ color: 0xdcffe4, alpha: 0.95 });

      const last = this.wallCells[this.wallCells.length - 1];
      const lp = { x: isoX(last.tx + 0.5, last.ty + 0.5), y: isoY(last.tx + 0.5, last.ty + 0.5) };
      if (!this.wallTip) {
        this.wallTip = new Text({
          text: '',
          style: {
            fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif',
            fontSize: 12,
            fill: 0xe6ffe8,
            stroke: { color: 0x0b0f0c, width: 3 },
          },
        });
        this.wallTip.anchor.set(0.5, 1);
        this.labels.addChild(this.wallTip);
      }
      const bad = this.wallCells.length - okCells.length;
      this.wallTip.text = `${okCells.length} 格 · ${okCells.length * BUILDING_DEFS.juma.cost} 粮${bad ? `（${bad} 格放不下）` : ''}`;
      this.wallTip.position.set(lp.x, lp.y - 14);
      this.wallTip.visible = true;
    } else if (this.wallTip) {
      this.wallTip.visible = false;
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
