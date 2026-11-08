// Existing terrain as a regular height grid (PLAN.md §5 M3): seeds → Delaunay → 0.10 m corner heights. Pure.
import Delaunator from 'delaunator';

/** Grid cell size (m). */
export const CELL = 0.1;
/** Outside the hull: hull boundary sampled every this (m) for the inverse-distance average. */
const HULL_STEP = 0.5;
/** Seeds closer than this (m, in plan) are merged (heights averaged). */
const MERGE = 0.01;

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * `cols` × `rows` cells; heights at the (cols + 1) × (rows + 1) cell corners, row-major from `origin` (min x, min y).
 * Heights in m rel ±0.00. Outside the seeds' hull the heights are an inverse-distance average of the hull boundary.
 */
export type HeightGrid = {
  cell: number;
  origin: { x: number; y: number };
  cols: number;
  rows: number;
  base: Float32Array;
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

/** Endpoints closer than this (m) are the same outline vertex. */
const JOIN = 0.01;

/**
 * A closed outline (segments [x1, y1, x2, y2, …], any order and direction) grown outward by `margin` (m), every edge
 * moved out parallel and neighbours joined at a sharp (mitred) corner. Vertices [x, y, …]. Undefined if the
 * segments don't form one closed loop.
 */
export function offsetOutline(s: Float64Array, margin: number): Float64Array | undefined {
  const n = s.length / 4;
  if (n < 3) return undefined;
  // Chain the segments into one loop of vertices.
  const used = new Uint8Array(n);
  const loop: [number, number][] = [[s[0]!, s[1]!]];
  let [cx, cy] = [s[2]!, s[3]!];
  used[0] = 1;
  for (let step = 1; step < n; step++) {
    loop.push([cx, cy]);
    let next = -1;
    for (let q = 0; q < n && next < 0; q++) {
      if (used[q]) continue;
      for (let e = 0; e < 2; e++) {
        if (Math.hypot(s[4 * q + 2 * e]! - cx, s[4 * q + 2 * e + 1]! - cy) > JOIN) continue;
        next = q;
        [cx, cy] = [s[4 * q + 2 * (1 - e)]!, s[4 * q + 2 * (1 - e) + 1]!];
        break;
      }
    }
    if (next < 0) return undefined;
    used[next] = 1;
  }
  if (Math.hypot(cx - loop[0]![0], cy - loop[0]![1]) > JOIN) return undefined; // not closed
  // Counter-clockwise, so "outward" is to the right of each edge.
  let area = 0;
  for (let k = 0; k < loop.length; k++) {
    const [x1, y1] = loop[k]!;
    const [x2, y2] = loop[(k + 1) % loop.length]!;
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) loop.reverse();
  const m = loop.length;
  // Each edge's outward unit normal.
  const normals = loop.map(([x1, y1], k) => {
    const [x2, y2] = loop[(k + 1) % m]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    return [(y2 - y1) / len, -(x2 - x1) / len] as const;
  });
  const out = new Float64Array(2 * m);
  for (let k = 0; k < m; k++) {
    // Vertex k joins edge k−1 and edge k: move it along the bisector of their normals so both edges shift by `margin`.
    const [ax, ay] = normals[(k - 1 + m) % m]!;
    const [bx, by] = normals[k]!;
    const cos = Math.max(ax * bx + ay * by, -0.9); // limit the spike at very sharp corners
    const scale = margin / (1 + cos);
    out[2 * k] = loop[k]![0] + (ax + bx) * scale;
    out[2 * k + 1] = loop[k]![1] + (ay + by) * scale;
  }
  return out;
}

/** Corners outside a polygon (vertices [x, y, …]) → 1. Even-odd crossings of a ray towards +x. */
export function outsideMask(g: HeightGrid, poly: Float64Array): Uint8Array {
  const w = g.cols + 1;
  const out = new Uint8Array(w * (g.rows + 1));
  const m = poly.length / 2;
  for (let j = 0, k = 0; j <= g.rows; j++) {
    const y = g.origin.y + j * g.cell;
    for (let i = 0; i < w; i++, k++) {
      const x = g.origin.x + i * g.cell;
      let inside = false;
      for (let p = 0, q = m - 1; p < m; q = p++) {
        const x1 = poly[2 * p]!, y1 = poly[2 * p + 1]!, x2 = poly[2 * q]!, y2 = poly[2 * q + 1]!;
        if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
      }
      out[k] = inside ? 0 : 1;
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

  // Outside: inverse-distance (1/d²) average of the hull boundary, plus the nearest boundary point, so the surface
  // meets the hull without a step and evens out towards the average of the boundary farther away (user, 2026-11-08).
  const hull = d.hull;
  const samples: number[] = [];
  for (let e = 0; e < hull.length; e++) {
    const p = hull[e]!;
    const q = hull[(e + 1) % hull.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(xy[2 * q]! - xy[2 * p]!, xy[2 * q + 1]! - xy[2 * p + 1]!) / HULL_STEP));
    for (let k = 0; k < n; k++) {
      const s = k / n;
      samples.push(
        xy[2 * p]! + s * (xy[2 * q]! - xy[2 * p]!),
        xy[2 * p + 1]! + s * (xy[2 * q + 1]! - xy[2 * p + 1]!),
        pts[3 * p + 2]! + s * (pts[3 * q + 2]! - pts[3 * p + 2]!),
      );
    }
  }
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
      const d0 = Math.max(best, 1e-12);
      let num = h / d0;
      let den = 1 / d0;
      for (let k = 0; k < samples.length; k += 3) {
        const d2 = Math.max((samples[k]! - x) ** 2 + (samples[k + 1]! - y) ** 2, 1e-12);
        num += samples[k + 2]! / d2;
        den += 1 / d2;
      }
      base[idx] = num / den;
    }
  }
  return { cell, origin: { x: ox, y: oy }, cols, rows, base };
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
