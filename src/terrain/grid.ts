// Existing terrain as a regular height grid (PLAN.md §5 M3): seeds → Delaunay → 0.10 m corner heights. Pure.
import Delaunator from 'delaunator';

/** Grid cell size (m). */
export const CELL = 0.1;
/** Seeds closer than this (m, in plan) are merged (heights averaged). */
const MERGE = 0.01;

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * `cols` × `rows` cells; heights at the (cols + 1) × (rows + 1) cell corners, row-major from `origin` (min x, min y).
 * Heights in m rel ±0.00. `uncertain` = 1 where a corner lies outside the seeds' hull (flat extrapolation).
 */
export type HeightGrid = {
  cell: number;
  origin: { x: number; y: number };
  cols: number;
  rows: number;
  base: Float32Array;
  uncertain: Uint8Array;
};

/** Seeds [x, y, h, …] → grid over `box` (snapped outward to the cell). Undefined if the seeds don't span an area. */
export function heightGrid(seeds: Float64Array, box: Box, cell = CELL): HeightGrid | undefined {
  const pts = mergeSeeds(seeds);
  const n = pts.length / 3;
  if (n < 3) return undefined;
  const xy = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    xy[2 * i] = pts[3 * i]!;
    xy[2 * i + 1] = pts[3 * i + 1]!;
  }
  const d = new Delaunator(xy);
  if (d.triangles.length === 0) return undefined; // all collinear

  const ox = Math.floor(box.minX / cell) * cell;
  const oy = Math.floor(box.minY / cell) * cell;
  const cols = Math.ceil((box.maxX - ox) / cell - 1e-9);
  const rows = Math.ceil((box.maxY - oy) / cell - 1e-9);
  const w = cols + 1;
  const base = new Float32Array(w * (rows + 1));
  const done = new Uint8Array(base.length);

  // Inside the hull: linear interpolation per triangle, over the corners in its bbox.
  const t = d.triangles;
  for (let k = 0; k < t.length; k += 3) {
    const [a, b, c] = [t[k]!, t[k + 1]!, t[k + 2]!];
    const ax = xy[2 * a]!, ay = xy[2 * a + 1]!;
    const bx = xy[2 * b]!, by = xy[2 * b + 1]!;
    const cx = xy[2 * c]!, cy = xy[2 * c + 1]!;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / cell - 1e-6));
    const i1 = Math.min(cols, Math.floor((Math.max(ax, bx, cx) - ox) / cell + 1e-6));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / cell - 1e-6));
    const j1 = Math.min(rows, Math.floor((Math.max(ay, by, cy) - oy) / cell + 1e-6));
    for (let j = j0; j <= j1; j++) {
      const y = oy + j * cell;
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * cell;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const idx = j * w + i;
        base[idx] = l1 * pts[3 * a + 2]! + l2 * pts[3 * b + 2]! + l3 * pts[3 * c + 2]!;
        done[idx] = 1;
      }
    }
  }

  // Outside: the height of the nearest point on the hull boundary, flagged uncertain.
  const hull = d.hull;
  const uncertain = new Uint8Array(base.length);
  for (let j = 0; j <= rows; j++) {
    const y = oy + j * cell;
    for (let i = 0; i <= cols; i++) {
      const idx = j * w + i;
      if (done[idx]) continue;
      const x = ox + i * cell;
      let best = Infinity;
      let h = 0;
      for (let e = 0; e < hull.length; e++) {
        const p = hull[e]!;
        const q = hull[(e + 1) % hull.length]!;
        const px = xy[2 * p]!, py = xy[2 * p + 1]!;
        const dx = xy[2 * q]! - px, dy = xy[2 * q + 1]! - py;
        const len2 = dx * dx + dy * dy;
        const s = len2 > 0 ? Math.min(1, Math.max(0, ((x - px) * dx + (y - py) * dy) / len2)) : 0;
        const ex = px + s * dx - x, ey = py + s * dy - y;
        const dist = ex * ex + ey * ey;
        if (dist < best) {
          best = dist;
          h = pts[3 * p + 2]! + s * (pts[3 * q + 2]! - pts[3 * p + 2]!);
        }
      }
      base[idx] = h;
      uncertain[idx] = 1;
    }
  }
  return { cell, origin: { x: ox, y: oy }, cols, rows, base, uncertain };
}

/** Bilinear height at plan (x, y); clamped to the grid's extent. */
export function sampleGrid(g: HeightGrid, x: number, y: number): number {
  const fx = Math.min(g.cols, Math.max(0, (x - g.origin.x) / g.cell));
  const fy = Math.min(g.rows, Math.max(0, (y - g.origin.y) / g.cell));
  const i = Math.min(g.cols - 1, Math.floor(fx));
  const j = Math.min(g.rows - 1, Math.floor(fy));
  const u = fx - i;
  const v = fy - j;
  const w = g.cols + 1;
  const h = (ii: number, jj: number) => g.base[jj * w + ii]!;
  return (1 - v) * ((1 - u) * h(i, j) + u * h(i + 1, j)) + v * ((1 - u) * h(i, j + 1) + u * h(i + 1, j + 1));
}

/** Seeds within MERGE of an earlier kept seed are folded into it (heights averaged). O(n²); n is a few hundred. */
function mergeSeeds(seeds: Float64Array): Float64Array {
  const kept: { x: number; y: number; sum: number; n: number }[] = [];
  for (let i = 0; i < seeds.length; i += 3) {
    const x = seeds[i]!, y = seeds[i + 1]!, h = seeds[i + 2]!;
    const k = kept.find((p) => Math.hypot(p.x - x, p.y - y) <= MERGE);
    if (k) {
      k.sum += h;
      k.n++;
    } else kept.push({ x, y, sum: h, n: 1 });
  }
  return Float64Array.from(kept.flatMap((p) => [p.x, p.y, p.sum / p.n]));
}

/** Plan bbox of segments [x1, y1, x2, y2, …] mapped by `f`. Undefined if there are none. */
export function segmentsBox(s: Float64Array, f: (x: number, y: number) => [number, number, ...number[]]): Box | undefined {
  if (s.length === 0) return undefined;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < s.length; i += 2) {
    const [x, y] = f(s[i]!, s[i + 1]!);
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

export const grow = (b: Box, m: number): Box => ({ minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m });
