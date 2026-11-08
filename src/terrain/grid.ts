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
  /** 1 = corner outside the modelled area (plot outline + margin): not drawn, not edited, not counted. None = all inside. */
  outside?: Uint8Array;
};

/** Is corner k outside the modelled area? */
export const isOutside = (g: HeightGrid, k: number) => g.outside?.[k] === 1;

/** Does a cell (SW corner index `a`) touch the outside? Such cells aren't drawn. */
export function cellOutside(g: HeightGrid, a: number): boolean {
  if (!g.outside) return false;
  const w = g.cols + 1;
  return (g.outside[a]! | g.outside[a + 1]! | g.outside[a + w]! | g.outside[a + w + 1]!) === 1;
}

/**
 * Corners farther than `margin` (m) outside a closed outline (segments [x1, y1, x2, y2, …], any order) → 1.
 * Inside = even-odd crossings of a ray towards +x.
 */
export function outsideMask(g: HeightGrid, s: Float64Array, margin: number): Uint8Array {
  const w = g.cols + 1;
  const out = new Uint8Array(w * (g.rows + 1));
  const m2 = margin * margin;
  for (let j = 0, k = 0; j <= g.rows; j++) {
    const y = g.origin.y + j * g.cell;
    for (let i = 0; i < w; i++, k++) {
      const x = g.origin.x + i * g.cell;
      let inside = false;
      let near = false;
      for (let q = 0; q < s.length; q += 4) {
        const x1 = s[q]!, y1 = s[q + 1]!, x2 = s[q + 2]!, y2 = s[q + 3]!;
        if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / len2)) : 0;
        const ex = x1 + t * dx - x, ey = y1 + t * dy - y;
        if (ex * ex + ey * ey <= m2) near = true;
      }
      out[k] = inside || near ? 0 : 1;
    }
  }
  return out;
}

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

/**
 * First point where a ray (plan coords: x, y, height) meets the grid's surface, or undefined. Marches in half-cell
 * steps over the grid's extent, then bisects. A ray straight down hits at its own (x, y).
 */
export function rayGrid(g: HeightGrid, o: [number, number, number], d: [number, number, number]): [number, number, number] | undefined {
  const bx0 = g.origin.x, bx1 = bx0 + g.cols * g.cell;
  const by0 = g.origin.y, by1 = by0 + g.rows * g.cell;
  const flat = Math.hypot(d[0], d[1]);
  if (flat < 1e-9) {
    if (o[0] < bx0 || o[0] > bx1 || o[1] < by0 || o[1] > by1) return undefined;
    return [o[0], o[1], sampleGrid(g, o[0], o[1])];
  }
  // Clip t to the grid's x/y slab.
  let t0 = 0;
  let t1 = Infinity;
  for (const [p, v, lo, hi] of [[o[0], d[0], bx0, bx1], [o[1], d[1], by0, by1]] as const) {
    if (Math.abs(v) < 1e-12) {
      if (p < lo || p > hi) return undefined;
      continue;
    }
    const a = (lo - p) / v, b = (hi - p) / v;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t1 > t0)) return undefined;
  const above = (t: number) => o[2] + t * d[2] - sampleGrid(g, o[0] + t * d[0], o[1] + t * d[1]);
  const dt = g.cell / 2 / flat;
  let prev = t0;
  if (above(prev) <= 0) return undefined; // starts under the surface
  for (let t = t0 + dt; t <= t1 + dt; t += dt) {
    const tt = Math.min(t, t1);
    if (above(tt) <= 0) {
      let lo = prev, hi = tt;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      return [o[0] + hi * d[0], o[1] + hi * d[1], o[2] + hi * d[2]];
    }
    prev = tt;
  }
  return undefined;
}
