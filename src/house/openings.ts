// Façade openings from the placed elevations (PLAN.md §5 M5 T3). Pure.
// Per elevation: the `A-GLAZ*` and `A-DOOR*` segments (not the door-swing layer) joined into pieces where they touch
// within JOIN; their
// bboxes ≥ MIN × MIN; overlapping boxes merged. Then each rect is moved from the elevation plane along the view
// direction to the first house triangle hit by a ray through its centre (≤ MAX_DEPTH), and drawn there.
import type { NormalizedSheet } from '../dwg/types';
import type { Vec2 } from './blocks';

/** Sheet rect: x along the elevation's `dir`, y = height rel. ±0.00. */
export type OpeningRect = { x0: number; y0: number; x1: number; y1: number };

const JOIN = 0.005;
const MIN = 0.3;
/** Rays from the elevation plane reach this far (m) into the house. */
export const MAX_DEPTH = 20;
/** Rays start this far (m) in front of the plane: PAB-08's plane lies 1 cm inside the gable it shows. */
const BACK = 0.3;

const isOpeningLayer = (name: string) => (/^A-GLAZ/.test(name) || /^A-DOOR/.test(name)) && !/\(łuki\)/.test(name);

const overlap = (a: OpeningRect, b: OpeningRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function findOpenings(sheet: NormalizedSheet): OpeningRect[] {
  const segs: [number, number, number, number][] = [];
  for (const l of sheet.layers)
    if (isOpeningLayer(l.name)) for (let i = 0; i < l.segments.length; i += 4) segs.push([l.segments[i]!, l.segments[i + 1]!, l.segments[i + 2]!, l.segments[i + 3]!]);
  // Pieces: segments whose boxes touch within JOIN (a door's panel lines end on its frame mid-line, not at an
  // endpoint). Union-find with a sweep over x.
  const box = segs.map((g) => ({ x0: Math.min(g[0], g[2]), y0: Math.min(g[1], g[3]), x1: Math.max(g[0], g[2]), y1: Math.max(g[1], g[3]) }));
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const order = box.map((_, i) => i).sort((i, j) => box[i]!.x0 - box[j]!.x0);
  for (let n = 0; n < order.length; n++) {
    const a = box[order[n]!]!;
    for (let m = n + 1; m < order.length && box[order[m]!]!.x0 <= a.x1 + JOIN; m++) {
      const b = box[order[m]!]!;
      if (b.y0 <= a.y1 + JOIN && a.y0 <= b.y1 + JOIN) parent[find(order[m]!)] = find(order[n]!);
    }
  }
  const boxes = new Map<number, OpeningRect>();
  box.forEach((g, i) => {
    const r = find(i);
    const b = boxes.get(r) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    boxes.set(r, { x0: Math.min(b.x0, g.x0), y0: Math.min(b.y0, g.y0), x1: Math.max(b.x1, g.x1), y1: Math.max(b.y1, g.y1) });
  });
  let rects = [...boxes.values()].filter((b) => b.x1 - b.x0 >= MIN && b.y1 - b.y0 >= MIN);
  // Merge overlapping boxes until none overlap (a window's frame, sashes and glass are separate pieces).
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++)
        if (overlap(rects[i]!, rects[j]!)) {
          const [a, b] = [rects[i]!, rects[j]!];
          rects[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
          rects.splice(j, 1);
          merged = true;
          break outer;
        }
  }
  rects = rects.map((r) => ({ x0: mm(r.x0), y0: mm(r.y0), x1: mm(r.x1), y1: mm(r.y1) }));
  return rects.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** Hidden-list key (PLAN.md §5 M5): sheet + rect to the cm. */
export const openingKey = (file: string, r: OpeningRect) => [file, r.x0, r.y0, r.x1, r.y1].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join('|');

export type Elevation = { origin: Vec2; dir: Vec2 };

/** A placed opening: its 4 world corners (x, y, z), counter-clockwise as seen by the elevation's viewer. */
export type PlacedOpening = { rect: OpeningRect; corners: [number, number, number][]; depth: number };

/**
 * Moves a rect from the elevation plane along the view direction (−dir.y, dir.x) to the first of `triangles`
 * (world xyz, 9 numbers each) hit by the ray through its centre, `lift` m in front of it. Undefined if none within
 * MAX_DEPTH.
 */
export function placeOpening(r: OpeningRect, e: Elevation, triangles: ArrayLike<number>, lift = 0.01): PlacedOpening | undefined {
  const v = { x: -e.dir.y, y: e.dir.x };
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.y0 + r.y1) / 2;
  const o: [number, number, number] = [e.origin.x + cx * e.dir.x - BACK * v.x, e.origin.y + cx * e.dir.y - BACK * v.y, cz];
  let best = Infinity;
  for (let i = 0; i < triangles.length; i += 9) {
    const t = rayTriangle(o, [v.x, v.y, 0], triangles, i);
    if (t !== undefined && t < best) best = t;
  }
  best -= BACK;
  if (!(best <= MAX_DEPTH)) return undefined;
  const d = best - lift;
  const at = (x: number, z: number): [number, number, number] => [e.origin.x + x * e.dir.x + d * v.x, e.origin.y + x * e.dir.y + d * v.y, z];
  return { rect: r, depth: best, corners: [at(r.x0, r.y0), at(r.x1, r.y0), at(r.x1, r.y1), at(r.x0, r.y1)] };
}

/** Möller–Trumbore: distance along the ray (≥ 0) to triangle i, or undefined. Double-sided. */
function rayTriangle(o: [number, number, number], d: [number, number, number], tr: ArrayLike<number>, i: number): number | undefined {
  const ax = tr[i]!;
  const ay = tr[i + 1]!;
  const az = tr[i + 2]!;
  const e1 = [tr[i + 3]! - ax, tr[i + 4]! - ay, tr[i + 5]! - az];
  const e2 = [tr[i + 6]! - ax, tr[i + 7]! - ay, tr[i + 8]! - az];
  const p = [d[1] * e2[2]! - d[2] * e2[1]!, d[2] * e2[0]! - d[0] * e2[2]!, d[0] * e2[1]! - d[1] * e2[0]!];
  const det = e1[0]! * p[0]! + e1[1]! * p[1]! + e1[2]! * p[2]!;
  if (Math.abs(det) < 1e-12) return undefined;
  const inv = 1 / det;
  const s = [o[0] - ax, o[1] - ay, o[2] - az];
  const u = (s[0]! * p[0]! + s[1]! * p[1]! + s[2]! * p[2]!) * inv;
  if (u < 0 || u > 1) return undefined;
  const q = [s[1]! * e1[2]! - s[2]! * e1[1]!, s[2]! * e1[0]! - s[0]! * e1[2]!, s[0]! * e1[1]! - s[1]! * e1[0]!];
  const w = (d[0] * q[0]! + d[1] * q[1]! + d[2] * q[2]!) * inv;
  if (w < 0 || u + w > 1) return undefined;
  const t = (e2[0]! * q[0]! + e2[1]! * q[1]! + e2[2]! * q[2]!) * inv;
  return t >= 0 ? t : undefined;
}
