// Mur (PLAN.md §5 M4b): a wall the user draws as a rect (5 cm snap). Drawn as a box from the lowest surface under it
// up to its `top`; it doesn't change the terrain. Pure: no React, no three. Plan m, heights rel ±0.00; triangles in
// scene coords (x, height, −y).
import { sampleGrid, type HeightGrid } from '../terrain/grid';
import type { Edit, Rect } from './edits';

/** A new wall's top: this far above the highest surface under it (m); then dragged or typed. */
export const NEW_WALL_ABOVE = 0.5;

export type WallSolid = {
  /** Lowest / highest surface under the wall (m rel): the box starts at `ground.min`. */
  ground: { min: number; max: number };
  /** Height above the surface (top − surface) along the wall, m. */
  hMin: number;
  hMax: number;
  /** footprint × (top − mean surface under it), m³. */
  volume: number;
  /** Non-indexed triangles, scene coords. */
  triangles: Float32Array;
};

/** Surface under the rect, sampled every cell (edges included). */
export function groundUnder(g: HeightGrid, r: Rect): { min: number; max: number; mean: number } {
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / g.cell));
  const ny = Math.max(1, Math.ceil((r.y1 - r.y0) / g.cell));
  let min = Infinity, max = -Infinity, sum = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const h = sampleGrid(g, r.x0 + ((r.x1 - r.x0) * i) / nx, r.y0 + ((r.y1 - r.y0) * j) / ny);
      min = Math.min(min, h);
      max = Math.max(max, h);
      sum += h;
    }
  }
  return { min, max, mean: sum / ((nx + 1) * (ny + 1)) };
}

export function wallSolid(g: HeightGrid, e: Edit & { tool: 'wall' }): WallSolid {
  const r = e.rect;
  const ground = groundUnder(g, r);
  const area = (r.x1 - r.x0) * (r.y1 - r.y0);
  const lo = ground.min;
  const hi = Math.max(e.top, lo);
  // Box corners in scene coords: plan (x, y) at height z → (x, z, −y).
  const p = (x: number, y: number, z: number) => [x, z, -y];
  const c = [p(r.x0, r.y0, lo), p(r.x1, r.y0, lo), p(r.x1, r.y1, lo), p(r.x0, r.y1, lo), p(r.x0, r.y0, hi), p(r.x1, r.y0, hi), p(r.x1, r.y1, hi), p(r.x0, r.y1, hi)];
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const tri: number[] = [];
  for (const [a, b, cc, d] of faces) for (const k of [a, b, cc, a, cc, d]) tri.push(...c[k!]!);
  return {
    ground: { min: ground.min, max: ground.max },
    hMin: Math.max(0, e.top - ground.max),
    hMax: Math.max(0, e.top - ground.min),
    volume: area * Math.max(0, e.top - ground.mean),
    triangles: Float32Array.from(tri),
  };
}
