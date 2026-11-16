// A* on the tile grid plus line-of-sight path smoothing.

import type { GameMap } from './map.js';
import type { Vec } from './types.js';

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

class MinHeap {
  private idx: number[] = [];
  private f: number[] = [];

  get size(): number {
    return this.idx.length;
  }

  clear(): void {
    this.idx.length = 0;
    this.f.length = 0;
  }

  push(i: number, pri: number): void {
    const a = this.idx;
    const b = this.f;
    a.push(i);
    b.push(pri);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (b[p] <= b[k]) break;
      const ti = a[p]; a[p] = a[k]; a[k] = ti;
      const tf = b[p]; b[p] = b[k]; b[k] = tf;
      k = p;
    }
  }

  pop(): number {
    const a = this.idx;
    const b = this.f;
    const top = a[0];
    const lastI = a.pop() as number;
    const lastF = b.pop() as number;
    if (a.length > 0) {
      a[0] = lastI;
      b[0] = lastF;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === k) break;
        const ti = a[m]; a[m] = a[k]; a[k] = ti;
        const tf = b[m]; b[m] = b[k]; b[k] = tf;
        k = m;
      }
    }
    return top;
  }
}

const heap = new MinHeap();

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
}

/** Supercover line walk: every tile the segment touches must be passable, including
 *  both orthogonal neighbours on a diagonal step (no corner cutting). */
export function lineOfSight(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    if (!map.passable(x, y)) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx) {
      // diagonal step: both side tiles must be walkable
      if (!map.passable(x + sx, y) || !map.passable(x, y + sy)) return false;
    }
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Returns tile waypoints (excluding the start tile) or null when unreachable.
 * `gx/gy` should already be passable; callers use map.nearestPassable for blocked goals.
 */
export function findPath(map: GameMap, sx: number, sy: number, gx: number, gy: number): Vec[] | null {
  const S = map.size;
  const start = sy * S + sx;
  const goal = gy * S + gx;
  if (start === goal) return [];
  if (!map.passable(sx, sy) || !map.passable(gx, gy)) return null;

  const n = S * S;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  heap.clear();

  gScore[start] = 0;
  heap.push(start, octile(sx, sy, gx, gy));

  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    if (++expanded > 16000) return null;

    const cx = cur % S;
    const cy = (cur - cx) / S;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      if (!map.passable(nx, ny)) continue;
      if (d >= 4) {
        // no corner cutting through diagonal gaps
        if (!map.passable(cx + DX[d], cy) || !map.passable(cx, cy + DY[d])) continue;
      }
      const ni = ny * S + nx;
      if (closed[ni]) continue;
      const step = d >= 4 ? SQRT2 : 1;
      const ng = gScore[cur] + step;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + octile(nx, ny, gx, gy));
      }
    }
  }

  if (came[goal] === -1 && start !== goal) return null;

  const raw: Vec[] = [];
  let cur = goal;
  while (cur !== start && cur !== -1) {
    const cx = cur % S;
    const cy = (cur - cx) / S;
    raw.push({ x: cx + 0.5, y: cy + 0.5 });
    cur = came[cur];
  }
  raw.reverse();

  // string pulling: drop waypoints we can walk to directly
  const out: Vec[] = [];
  let ax = sx + 0.5;
  let ay = sy + 0.5;
  let i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i) {
      if (lineOfSight(map, Math.floor(ax), Math.floor(ay), Math.floor(raw[j].x), Math.floor(raw[j].y))) break;
      j--;
    }
    out.push(raw[j]);
    ax = raw[j].x;
    ay = raw[j].y;
    i = j + 1;
  }
  return out;
}
