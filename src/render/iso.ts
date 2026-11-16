// Isometric projection helpers. World coordinates are in tiles (x, y), screen
// coordinates are pixels relative to the world container origin.

export const TILE_W = 64;
export const TILE_H = 32;

export function isoX(x: number, y: number): number {
  return (x - y) * (TILE_W / 2);
}

export function isoY(x: number, y: number): number {
  return (x + y) * (TILE_H / 2);
}

export interface TileCoord {
  x: number;
  y: number;
}

export function screenToTile(sx: number, sy: number): TileCoord {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Diamond polygon for a tile, slightly inflated to avoid anti-aliasing seams. */
export function tileDiamond(tx: number, ty: number, grow = 0.5): number[] {
  const cx = isoX(tx + 0.5, ty + 0.5);
  const cy = isoY(tx + 0.5, ty + 0.5);
  const hw = TILE_W / 2 + grow;
  const hh = TILE_H / 2 + grow;
  return [cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy];
}
