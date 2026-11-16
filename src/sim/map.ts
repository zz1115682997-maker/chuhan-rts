// Terrain / occupancy grid for the isometric battlefield.
// Deterministic: generated purely from the seeded Rng.

import { Rng } from './rng.js';

export const T_GRASS = 0;
export const T_DIRT = 1;
export const T_WATER = 2;
export const T_ROCK = 3;

export const MAP_SIZE = 48;

export interface Tile {
  x: number;
  y: number;
}

export class GameMap {
  readonly size: number;
  readonly terrain: Uint8Array;
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
      if (m.terrain[m.idx(x, y)] === T_WATER || m.terrain[m.idx(x, y)] === T_ROCK) {
        m.terrain[m.idx(x, y)] = T_GRASS;
      }
    }
  }
}

/** Build the two mirrored starting bases and the shared battlefield. */
export function generateMap(seed: number): GameMap {
  const S = MAP_SIZE;
  const m = new GameMap(S);
  const rng = new Rng(seed);
  const half = (x: number, y: number) => x + y <= S - 1;

  // water lakes on one half, mirrored to the other
  for (let i = 0; i < 9; i++) {
    const x = rng.int(S);
    const y = rng.int(S);
    if (!half(x, y)) continue;
    blob(m, x, y, 2 + rng.next() * 2.5, T_WATER, rng);
  }
  // rocky outcrops
  for (let i = 0; i < 14; i++) {
    const x = rng.int(S);
    const y = rng.int(S);
    if (!half(x, y)) continue;
    blob(m, x, y, 1 + rng.next() * 1.6, T_ROCK, rng);
  }
  // dirt patches for visual variety
  for (let i = 0; i < 16; i++) {
    const x = rng.int(S);
    const y = rng.int(S);
    if (!half(x, y)) continue;
    blob(m, x, y, 1.5 + rng.next() * 2, T_DIRT, rng);
  }

  // mirror the lower triangle into the upper one
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x + y > S - 1) continue;
      const mx = S - 1 - x;
      const my = S - 1 - y;
      m.terrain[m.idx(mx, my)] = m.terrain[m.idx(x, y)];
    }
  }

  // starting bases: player bottom-left, AI top-right
  clearArea(m, 7, 7, 9);
  clearArea(m, S - 8, S - 8, 9);

  // ore fields (mirrored)
  const oreSpots: Array<[number, number, number]> = [
    [13, 13, 3.2],
    [4, 16, 2.6],
    [16, 4, 2.6],
    [23, 23, 4.2],
    [10, 26, 2.4],
  ];
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
        m.ore[i] = 4000 + rng.int(3000);
        // mirror
        const mx = S - 1 - x;
        const my = S - 1 - y;
        if (m.isGround(mx, my) && m.ore[m.idx(mx, my)] === 0) {
          m.ore[m.idx(mx, my)] = 4000 + rng.int(3000);
        }
      }
    }
  }

  return m;
}

export const PLAYER_BASE: Tile = { x: 7, y: 7 };
export const AI_BASE: Tile = { x: MAP_SIZE - 8, y: MAP_SIZE - 8 };
