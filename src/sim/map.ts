// Terrain generation. Four map archetypes, all mirrored so both starting
// positions are identical, plus a guaranteed land connection between bases.

import { Rng } from './rng.js';

export const T_GRASS = 0;
export const T_DIRT = 1;
export const T_WATER = 2;
export const T_ROCK = 3;

export const MAP_SIZE = 48;

export type MapKind = 'plains' | 'river' | 'mountain' | 'islands';

export interface MapPreset {
  kind: MapKind;
  name: string;
  tagline: string;
  desc: string;
}

export const MAP_PRESETS: MapPreset[] = [
  { kind: 'plains', name: '平原', tagline: '一马平川', desc: '地势开阔，几乎无险可守。兵力多的一方正面碾压。' },
  { kind: 'river', name: '河网', tagline: '水乡泽国', desc: '河道横贯全图，渡口是唯一通路。守住渡口就能以少打多。' },
  { kind: 'mountain', name: '山地', tagline: '险隘重峦', desc: '山岩割裂战场，隘口狭窄。适合设伏，不适合大军展开。' },
  { kind: 'islands', name: '海岛', tagline: '群岛争锋', desc: '陆地零碎，只靠几条陆桥相连。抢桥就是抢命。' },
];

export interface Tile {
  x: number;
  y: number;
}

export class GameMap {
  readonly size: number;
  readonly terrain: Uint8Array;
  /** grain fields — the resource layer */
  readonly ore: Uint16Array;
  /** 0 = free, otherwise buildingId + 1 */
  readonly occupied: Int32Array;

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.terrain = new Uint8Array(n);
    this.ore = new Uint16Array(n);
    this.occupied = new Int32Array(n);
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  terrainAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return T_ROCK;
    return this.terrain[this.idx(x, y)];
  }

  isGround(x: number, y: number): boolean {
    const t = this.terrainAt(x, y);
    return t === T_GRASS || t === T_DIRT;
  }

  passable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    const t = this.terrain[i];
    if (t === T_WATER || t === T_ROCK) return false;
    return this.occupied[i] === 0;
  }

  buildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    const t = this.terrain[i];
    if (t !== T_GRASS && t !== T_DIRT) return false;
    if (this.occupied[i] !== 0) return false;
    if (this.ore[i] > 0) return false;
    return true;
  }

  setOccupied(tx: number, ty: number, w: number, h: number, buildingId: number): void {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (this.inBounds(x, y)) this.occupied[this.idx(x, y)] = buildingId + 1;
      }
    }
  }

  clearOccupied(tx: number, ty: number, w: number, h: number): void {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (this.inBounds(x, y)) this.occupied[this.idx(x, y)] = 0;
      }
    }
  }

  blockRectFree(tx: number, ty: number, w: number, h: number): boolean {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (!this.buildable(x, y)) return false;
      }
    }
    return true;
  }

  nearestPassable(x: number, y: number, maxR = 10): Tile | null {
    if (this.passable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.passable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  nearestOre(x: number, y: number, maxR = 40): Tile | null {
    let best: Tile | null = null;
    let bestD = Infinity;
    for (let oy = 0; oy < this.size; oy++) {
      for (let ox = 0; ox < this.size; ox++) {
        if (this.ore[this.idx(ox, oy)] <= 200) continue;
        const d = (ox - x) * (ox - x) + (oy - y) * (oy - y);
        if (d < bestD) {
          bestD = d;
          best = { x: ox, y: oy };
        }
      }
    }
    if (best && bestD > maxR * maxR) return best;
    return best;
  }
}

// ---------------------------------------------------------------- helpers

function blob(m: GameMap, cx: number, cy: number, r: number, type: number, rng: Rng): void {
  const rr = r * r;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!m.inBounds(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d = dx * dx + dy * dy;
      if (d <= rr * (0.75 + rng.next() * 0.5)) m.terrain[m.idx(x, y)] = type;
    }
  }
}

function clearArea(m: GameMap, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!m.inBounds(x, y)) continue;
      const i = m.idx(x, y);
      if (m.terrain[i] === T_WATER || m.terrain[i] === T_ROCK) m.terrain[i] = T_GRASS;
    }
  }
}

function mirrorHalf(m: GameMap): void {
  const S = m.size;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x + y > S - 1) continue;
      m.terrain[m.idx(S - 1 - x, S - 1 - y)] = m.terrain[m.idx(x, y)];
    }
  }
}

/** Dijkstra across terrain cost; carve a walkable corridor if bases are cut off. */
function ensureConnected(m: GameMap, ax: number, ay: number, bx: number, by: number): void {
  const S = m.size;
  const n = S * S;
  const start = ay * S + ax;
  const goal = by * S + bx;

  // already connected?
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  queue[qt++] = start;
  seen[start] = 1;
  while (qh < qt) {
    const cur = queue[qh++];
    if (cur === goal) return;
    const cx = cur % S;
    const cy = (cur - cx) / S;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!m.inBounds(nx, ny)) continue;
      const ni = ny * S + nx;
      if (seen[ni]) continue;
      const t = m.terrain[ni];
      if (t === T_WATER || t === T_ROCK) continue;
      seen[ni] = 1;
      queue[qt++] = ni;
    }
  }

  // carve: uniform-cost search with terrain weights
  const cost = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  cost[start] = 0;
  const heap: number[] = [start];
  const pri: number[] = [0];
  const price = (t: number): number => (t === T_GRASS || t === T_DIRT ? 1 : t === T_ROCK ? 6 : 12);

  const push = (i: number, p: number): void => {
    heap.push(i);
    pri.push(p);
    let k = heap.length - 1;
    while (k > 0) {
      const q = (k - 1) >> 1;
      if (pri[q] <= pri[k]) break;
      [heap[q], heap[k]] = [heap[k], heap[q]];
      [pri[q], pri[k]] = [pri[k], pri[q]];
      k = q;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const lastI = heap.pop() as number;
    const lastP = pri.pop() as number;
    if (heap.length > 0) {
      heap[0] = lastI;
      pri[0] = lastP;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let s = k;
        if (l < heap.length && pri[l] < pri[s]) s = l;
        if (r < heap.length && pri[r] < pri[s]) s = r;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k], heap[s]];
        [pri[s], pri[k]] = [pri[k], pri[s]];
        k = s;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const cur = pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) break;
    const cx = cur % S;
    const cy = (cur - cx) / S;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!m.inBounds(nx, ny)) continue;
      const ni = ny * S + nx;
      if (done[ni]) continue;
      const nc = cost[cur] + price(m.terrain[ni]);
      if (nc < cost[ni]) {
        cost[ni] = nc;
        prev[ni] = cur;
        push(ni, nc);
      }
    }
  }

  if (prev[goal] === -1) return;
  let cur = goal;
  while (cur !== start && cur !== -1) {
    const cx = cur % S;
    const cy = (cur - cx) / S;
    for (let oy = 0; oy <= 1; oy++) {
      for (let ox = 0; ox <= 1; ox++) {
        if (!m.inBounds(cx + ox, cy + oy)) continue;
        const i = m.idx(cx + ox, cy + oy);
        if (m.terrain[i] === T_WATER || m.terrain[i] === T_ROCK) m.terrain[i] = T_DIRT;
      }
    }
    cur = prev[cur];
  }
}

// ---------------------------------------------------------------- generator

export function generateMap(kind: MapKind, seed: number): GameMap {
  const S = MAP_SIZE;
  const m = new GameMap(S);
  const rng = new Rng(seed);
  const half = (x: number, y: number): boolean => x + y <= S - 1;

  if (kind === 'river') {
    const bandYs = [12 + rng.int(4), 20 + rng.int(4)];
    for (const y0 of bandYs) {
      const thick = 2;
      const gapXs = [10 + rng.int(12), 26 + rng.int(10)];
      for (let x = 0; x < S; x++) {
        if (!half(x, y0)) continue;
        let gap = false;
        for (const gx of gapXs) if (Math.abs(x - gx) <= 1) gap = true;
        if (gap) continue;
        for (let t = 0; t < thick; t++) {
          if (m.inBounds(x, y0 + t)) m.terrain[m.idx(x, y0 + t)] = T_WATER;
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 1.5 + rng.next() * 1.5, T_WATER, rng);
    }
  } else if (kind === 'mountain') {
    for (let i = 0; i < 16; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 1.4 + rng.next() * 2.2, T_ROCK, rng);
    }
    for (let i = 0; i < 4; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 1.5 + rng.next(), T_WATER, rng);
    }
  } else if (kind === 'islands') {
    for (let i = 0; i < 7; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 3.5 + rng.next() * 3.5, T_WATER, rng);
    }
    for (let i = 0; i < 5; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 1 + rng.next(), T_ROCK, rng);
    }
  } else {
    // plains: wide open, a few ponds and low rocks
    for (let i = 0; i < 3; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 2 + rng.next() * 2, T_WATER, rng);
    }
    for (let i = 0; i < 5; i++) {
      const x = rng.int(S);
      const y = rng.int(S);
      if (!half(x, y)) continue;
      blob(m, x, y, 1 + rng.next(), T_ROCK, rng);
    }
  }

  // dirt patches for texture
  for (let i = 0; i < 14; i++) {
    const x = rng.int(S);
    const y = rng.int(S);
    if (!half(x, y)) continue;
    blob(m, x, y, 1.5 + rng.next() * 2, T_DIRT, rng);
  }

  mirrorHalf(m);

  clearArea(m, 7, 7, 9);
  clearArea(m, S - 8, S - 8, 9);

  const oreCount = kind === 'plains' ? 7 : kind === 'islands' ? 5 : 6;
  const oreSpots: Array<[number, number, number]> = [];
  for (let i = 0; i < oreCount; i++) {
    oreSpots.push([4 + rng.int(S - 8), 4 + rng.int(S - 8), 2.2 + rng.next() * 2.2]);
  }
  oreSpots.push([13, 13, 3.2]);
  oreSpots.push([S - 13, S - 13, 3.2]);

  for (const [ox, oy, orad] of oreSpots) {
    for (let y = Math.floor(oy - orad); y <= oy + orad; y++) {
      for (let x = Math.floor(ox - orad); x <= ox + orad; x++) {
        if (!m.inBounds(x, y)) continue;
        const dx = x - ox;
        const dy = y - oy;
        if (dx * dx + dy * dy > orad * orad) continue;
        if (!m.isGround(x, y)) continue;
        const i = m.idx(x, y);
        if (m.ore[i] > 0) continue;
        const amount = 4000 + rng.int(3000);
        m.ore[i] = amount;
        const mx = S - 1 - x;
        const my = S - 1 - y;
        if (m.isGround(mx, my) && m.ore[m.idx(mx, my)] === 0) m.ore[m.idx(mx, my)] = amount;
      }
    }
  }

  ensureConnected(m, 7, 7, S - 8, S - 8);

  // keep the two base pads clean after carving
  clearArea(m, 7, 7, 6);
  clearArea(m, S - 8, S - 8, 6);

  return m;
}

export const PLAYER_BASE: Tile = { x: 7, y: 7 };
export const AI_BASE: Tile = { x: MAP_SIZE - 8, y: MAP_SIZE - 8 };
