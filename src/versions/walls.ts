// Retaining walls (PLAN.md §5 M4b): derived from a version's surface, never stored. For each Mur edge of each edit,
// sample the surface along the edge on its two sides (the edge's grid corners and the next corners outside). The
// higher side is held: the wall stands on it, 0.25 m thick, its face on the low side's corner line (so the one-cell
// step strip of the terrain lies inside the wall), top = the high side's surface + CAP, bottom = the low side's surface.
// Pure: no React, no three. Plan m, heights rel ±0.00; triangles in scene coords (x, height, −y).
import { sampleGrid, type HeightGrid } from '../terrain/grid';
import { edgesOf, SIDES, type Edit, type Side } from './edits';

export const WALL_THICKNESS = 0.25;
/** The drawn top sits this far above the high side (no z-fighting with the terrain); not in the figures. */
const CAP = 0.02;

export type Wall = {
  edit: string;
  side: Side;
  /** m */
  length: number;
  /** Visible height (high side − low side) along the wall, m. */
  hMin: number;
  hMax: number;
  /** length × thickness × mean visible height, m³. */
  volume: number;
  /** Non-indexed triangles, scene coords. */
  triangles: Float32Array;
};

export function walls(g: HeightGrid, edits: readonly Edit[]): Wall[] {
  const out: Wall[] = [];
  for (const e of edits) {
    const edges = edgesOf(e);
    for (const side of SIDES) if (edges[side] === 'wall') out.push(wall(g, e, side));
  }
  return out;
}

function wall(g: HeightGrid, e: Edit, side: Side): Wall {
  const r = e.rect;
  // The edge as a line u ↦ plan point, and its outward unit normal.
  const alongX = side === 's' || side === 'n';
  const [u0, u1] = alongX ? [r.x0, r.x1] : [r.y0, r.y1];
  const fixed = { w: r.x0, e: r.x1, s: r.y0, n: r.y1 }[side];
  const out = side === 'e' || side === 'n' ? 1 : -1;
  const at = (u: number, offset: number): [number, number] =>
    alongX ? [u, fixed + out * offset] : [fixed + out * offset, u];
  const h = (u: number, offset: number) => sampleGrid(g, ...at(u, offset));

  const n = Math.max(1, Math.round((u1 - u0) / g.cell));
  const us = Array.from({ length: n + 1 }, (_, k) => u0 + ((u1 - u0) * k) / n);
  const inside = us.map((u) => h(u, 0));
  const outside = us.map((u) => h(u, g.cell));
  // One held side for the whole wall: the side that is higher on average.
  const insideHigh = inside.reduce((s, v, k) => s + v - outside[k]!, 0) >= 0;
  const top = insideHigh ? inside : outside;
  const bottom = insideHigh ? outside : inside;
  // Face on the low side's corner line; the wall extends from there towards the high side.
  const face = insideHigh ? g.cell : 0;
  const back = insideHigh ? g.cell - WALL_THICKNESS : WALL_THICKNESS;

  const heights = us.map((_, k) => Math.max(0, top[k]! - bottom[k]!));
  const mean = heights.reduce((s, v) => s + v, 0) / heights.length;
  const length = u1 - u0;

  const tri: number[] = [];
  const p = (u: number, offset: number, z: number) => {
    const [x, y] = at(u, offset);
    return [x, z, -y];
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => tri.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let k = 0; k < n; k++) {
    const [ua, ub] = [us[k]!, us[k + 1]!];
    const [ta, tb] = [top[k]! + CAP, top[k + 1]! + CAP];
    const [ba, bb] = [bottom[k]!, bottom[k + 1]!];
    quad(p(ua, face, ba), p(ub, face, bb), p(ub, face, tb), p(ua, face, ta)); // face
    quad(p(ua, face, ta), p(ub, face, tb), p(ub, back, tb), p(ua, back, ta)); // top
    quad(p(ua, back, ba), p(ub, back, bb), p(ub, back, tb), p(ua, back, ta)); // back (in the ground)
  }
  for (const k of [0, n]) {
    const u = us[k]!;
    quad(p(u, face, bottom[k]!), p(u, back, bottom[k]!), p(u, back, top[k]! + CAP), p(u, face, top[k]! + CAP)); // ends
  }
  return {
    edit: e.id,
    side,
    length,
    hMin: Math.min(...heights),
    hMax: Math.max(...heights),
    volume: length * WALL_THICKNESS * mean,
    triangles: Float32Array.from(tri),
  };
}
