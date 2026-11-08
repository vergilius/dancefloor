// Flat blocks from the ground plan around the main body (PLAN.md §5 M5, ADR 0005 amendment). Pure.
// - Annex: per side of the main rectangle, the `A-WALL` lines ≥ ANNEX_MIN_LEN lying wholly beyond that side; their
//   bbox, extended to the main body's wall.
// - Posts: closed `A-WALL` loops wholly outside the main rectangle and the annexes, each side ≤ POST_MAX; outermost
//   only (posts are drawn as nested rectangles), as their bbox. Only 4-sided loops; others (e.g. round ones) counted.
// - Columns: closed 4-sided loops on the `S-COLS*` layers (any size up to POST_MAX), outermost only; their heights
//   come from a vertical sheet's `S-COLS*` extent (section A-A on the real files), see `columnHeights`.
// - Slabs: `A-DETL-1` chains whose two open ends lie near the main rectangle, closed along its perimeter (the
//   shorter way). Closed loops inside a slab (openings) are counted, not modelled.
import type { NormalizedSheet } from '../dwg/types';
import { polygonArea, type GableBlock, type Vec2 } from './blocks';

export const WALL_LAYER = 'A-WALL';
export const SLAB_LAYER = 'A-DETL-1';
const isColumnLayer = (name: string) => /^S-COLS/.test(name);
const ANNEX_MIN_LEN = 2;
/** Lines must lie this far (m) beyond the main body's side to count for an annex. */
const BEYOND = 0.05;
const POST_MAX = 1;
const POST_MIN = 0.2;
/** Endpoints closer than this (m) are joined. */
const JOIN = 0.005;
/** A slab chain's open ends must lie this close (m) to the main rectangle's perimeter. */
const SLAB_REACH = 0.5;

export type Side = 'north' | 'south' | 'east' | 'west';
type Rect = { x0: number; y0: number; x1: number; y1: number };
type Seg = [number, number, number, number];

export type PlanBlocks = {
  annexes: { side: Side; polygon: Vec2[] }[];
  posts: Vec2[][];
  columns: Vec2[][];
  slabs: Vec2[][];
  /** Closed `A-DETL-1` loops inside a slab, not modelled. */
  slabOpenings: number;
  /** Small closed `A-WALL` loops that aren't 4-sided (round posts, pipes), not modelled. */
  skippedLoops: number;
};

const mm = (v: number) => Math.round(v * 1000) / 1000;
const rectPoly = (r: Rect): Vec2[] => [
  { x: mm(r.x0), y: mm(r.y0) },
  { x: mm(r.x1), y: mm(r.y0) },
  { x: mm(r.x1), y: mm(r.y1) },
  { x: mm(r.x0), y: mm(r.y1) },
];

function segments(sheet: NormalizedSheet, layer: string): Seg[] {
  const s = sheet.layers.find((l) => l.name === layer)?.segments;
  const out: Seg[] = [];
  if (s) for (let i = 0; i < s.length; i += 4) out.push([s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!]);
  return out;
}

const bbox = (pts: Vec2[]): Rect => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y)),
});
const segPts = (s: Seg): Vec2[] => [
  { x: s[0], y: s[1] },
  { x: s[2], y: s[3] },
];
const inside = (p: Vec2, r: Rect, pad = 0) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.y > r.y0 - pad && p.y < r.y1 + pad;
const within = (a: Rect, b: Rect) => a.x0 >= b.x0 - JOIN && a.y0 >= b.y0 - JOIN && a.x1 <= b.x1 + JOIN && a.y1 <= b.y1 + JOIN;

/** Connected pieces of a segment set (endpoints joined within JOIN), each with its endpoint degrees. */
function components(segs: Seg[]): { segs: Seg[]; closed: boolean }[] {
  const key = (x: number, y: number) => `${Math.round(x / JOIN)},${Math.round(y / JOIN)}`;
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const at = new Map<string, number>();
  const degree = new Map<string, number>();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      degree.set(k, (degree.get(k) ?? 0) + 1);
      const j = at.get(k);
      if (j === undefined) at.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Seg[]>();
  segs.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), s]));
  return [...groups.values()].map((g) => ({
    segs: g,
    closed: g.every((s) => degree.get(key(s[0], s[1])) === 2 && degree.get(key(s[2], s[3])) === 2),
  }));
}

/** Orders a chain or loop of segments into a point path (loops: first point not repeated). Undefined if it branches. */
function walk(segs: Seg[]): Vec2[] | undefined {
  const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < JOIN;
  const left = segs.map((s): [Vec2, Vec2] => [
    { x: s[0], y: s[1] },
    { x: s[2], y: s[3] },
  ]);
  // Start at an open end if there is one.
  const ends = left.flatMap((s) => s).filter((p) => left.flatMap((s) => s).filter((q) => near(p, q)).length === 1);
  if (ends.length !== 0 && ends.length !== 2) return undefined;
  const start = ends[0] ?? left[0]?.[0];
  if (!start) return undefined;
  const path: Vec2[] = [start];
  let cur = start;
  while (left.length) {
    const i = left.findIndex((s) => near(s[0], cur) || near(s[1], cur));
    if (i < 0) return undefined;
    const [a, b] = left.splice(i, 1)[0]!;
    cur = near(a, cur) ? b : a;
    path.push(cur);
  }
  if (ends.length === 0) path.pop(); // loop: back at the start
  return path;
}

/** Perimeter position (0…P, counter-clockwise from (x0, y0)) of the perimeter point nearest p. */
function perimeterT(r: Rect, p: Vec2): { t: number; q: Vec2 } {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const cx = Math.min(r.x1, Math.max(r.x0, p.x));
  const cy = Math.min(r.y1, Math.max(r.y0, p.y));
  const d = [cy - r.y0, r.x1 - cx, r.y1 - cy, cx - r.x0]; // to south, east, north, west edge
  const e = d.indexOf(Math.min(...d));
  if (e === 0) return { t: cx - r.x0, q: { x: cx, y: r.y0 } };
  if (e === 1) return { t: w + (cy - r.y0), q: { x: r.x1, y: cy } };
  if (e === 2) return { t: w + h + (r.x1 - cx), q: { x: cx, y: r.y1 } };
  return { t: 2 * w + h + (r.y1 - cy), q: { x: r.x0, y: cy } };
}

/** Perimeter path from t = a to t = b (exclusive of both ends' points): the corners passed, the shorter way. */
function perimeterCorners(r: Rect, a: number, b: number): Vec2[] {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const P = 2 * (w + h);
  const corners = [
    { t: 0, p: { x: r.x0, y: r.y0 } },
    { t: w, p: { x: r.x1, y: r.y0 } },
    { t: w + h, p: { x: r.x1, y: r.y1 } },
    { t: 2 * w + h, p: { x: r.x0, y: r.y1 } },
  ];
  const mod = (v: number) => ((v % P) + P) % P;
  const fwd = mod(b - a);
  // Forward (counter-clockwise) if that is the shorter way, else backward; corners strictly between, in order.
  const dist = fwd <= P / 2 ? (t: number) => mod(t - a) : (t: number) => mod(a - t);
  const len = fwd <= P / 2 ? fwd : P - fwd;
  return corners
    .map((c) => ({ s: dist(c.t), p: c.p }))
    .filter((c) => c.s > 1e-6 && c.s < len - 1e-6)
    .sort((x, y) => x.s - y.s)
    .map((c) => c.p);
}

/** Drops repeated and collinear corners, rounds to mm. */
function clean(poly: Vec2[]): Vec2[] {
  let p = poly.map((v) => ({ x: mm(v.x), y: mm(v.y) }));
  p = p.filter((v, i) => {
    const n = p[(i + 1) % p.length]!;
    return Math.hypot(n.x - v.x, n.y - v.y) > JOIN;
  });
  return p.filter((v, i) => {
    const a = p[(i + p.length - 1) % p.length]!;
    const b = p[(i + 1) % p.length]!;
    return Math.abs((v.x - a.x) * (b.y - a.y) - (v.y - a.y) * (b.x - a.x)) > 1e-6;
  });
}

/** Closed loops with both sides in min…POST_MAX: 4-sided ones as rectangles (outermost of nested/equal ones), the rest counted. */
function smallLoops(segs: Seg[], min: number): { rects: Vec2[][]; skipped: number } {
  const small = components(segs)
    .filter((c) => c.closed)
    .map((c) => ({ n: c.segs.length, b: bbox(c.segs.flatMap(segPts)) }))
    .filter(({ b }) => b.x1 - b.x0 <= POST_MAX && b.y1 - b.y0 <= POST_MAX && b.x1 - b.x0 >= min && b.y1 - b.y0 >= min);
  const loops = small.filter((l) => l.n === 4).map((l) => l.b);
  const rects = loops.filter((b, i) => !loops.some((o, j) => j !== i && within(b, o) && !(within(o, b) && j > i))).map(rectPoly);
  return { rects, skipped: small.length - loops.length };
}

/** Column bottom/top: the height extent of a vertical sheet's `S-COLS*` layers (sheet y = height rel. ±0.00). */
export function columnHeights(sheet: NormalizedSheet): { bottom: number; top: number } | undefined {
  let bottom = Infinity;
  let top = -Infinity;
  for (const l of sheet.layers)
    if (isColumnLayer(l.name))
      for (let i = 1; i < l.segments.length; i += 2) {
        bottom = Math.min(bottom, l.segments[i]!);
        top = Math.max(top, l.segments[i]!);
      }
  return top > bottom ? { bottom: mm(bottom), top: mm(top) } : undefined;
}

export function blocksFromPlan(sheet: NormalizedSheet, main: GableBlock): PlanBlocks {
  const r: Rect = { x0: main.x0, y0: main.y0, x1: main.x1, y1: main.y1 };
  const walls = segments(sheet, WALL_LAYER);

  const beyond: Record<Side, (p: Vec2) => boolean> = {
    north: (p) => p.y > r.y1 + BEYOND,
    south: (p) => p.y < r.y0 - BEYOND,
    east: (p) => p.x > r.x1 + BEYOND,
    west: (p) => p.x < r.x0 - BEYOND,
  };
  const annexRects: Rect[] = [];
  const annexes: PlanBlocks['annexes'] = [];
  for (const side of ['north', 'south', 'east', 'west'] as Side[]) {
    const long = walls.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) >= ANNEX_MIN_LEN && segPts(s).every(beyond[side]));
    if (long.length === 0) continue;
    const b = bbox(long.flatMap(segPts));
    if (side === 'north') b.y0 = r.y1;
    if (side === 'south') b.y1 = r.y0;
    if (side === 'east') b.x0 = r.x1;
    if (side === 'west') b.x1 = r.x0;
    annexRects.push(b);
    annexes.push({ side, polygon: rectPoly(b) });
  }

  const outsideAll = (p: Vec2) => !inside(p, r) && !annexRects.some((a) => inside(p, a));
  const postLoops = smallLoops(walls.filter((s) => segPts(s).every(outsideAll)), POST_MIN);
  const posts = postLoops.rects;
  const skippedLoops = postLoops.skipped;
  // Per layer: `S-COLS` draws the columns' X diagonals onto the corners of the `S-COLS-1` rectangles.
  const columnRects = sheet.layers.filter((l) => isColumnLayer(l.name)).flatMap((l) => smallLoops(segments(sheet, l.name), 0).rects);
  // Sorted north → south, then west → east, so "Kolumna n" names stay stable between runs.
  const columns = columnRects
    .filter((c, i) => !columnRects.some((o, j) => j < i && within(bbox(c), bbox(o)) && within(bbox(o), bbox(c))))
    .sort((a, b) => b[0]!.y - a[0]!.y || a[0]!.x - b[0]!.x);

  const slabs: Vec2[][] = [];
  const closedLoops: Vec2[][] = [];
  for (const c of components(segments(sheet, SLAB_LAYER))) {
    const path = walk(c.segs);
    if (!path || path.length < 3) continue;
    if (c.closed) {
      closedLoops.push(path);
      continue;
    }
    const a = perimeterT(r, path[0]!);
    const b = perimeterT(r, path.at(-1)!);
    const reach = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y) <= SLAB_REACH;
    if (!reach(path[0]!, a.q) || !reach(path.at(-1)!, b.q)) continue;
    // path end → its perimeter point → corners → the start's perimeter point (then back to path[0]).
    const poly = clean([...path, b.q, ...perimeterCorners(r, b.t, a.t), a.q]);
    if (poly.length >= 3 && polygonArea(poly) > 0.01) slabs.push(poly);
  }
  // Closed loops: openings if inside a slab's bbox, else slabs of their own.
  let slabOpenings = 0;
  for (const loop of closedLoops) {
    const lb = bbox(loop);
    if (slabs.some((s) => within(lb, bbox(s)))) slabOpenings++;
    else slabs.push(clean(loop));
  }
  return { annexes, posts, columns, slabs, slabOpenings, skippedLoops };
}
