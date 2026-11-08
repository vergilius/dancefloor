// Edits of a version (PLAN.md §5 M4a, M4b): terrain rects on a 0.5 m lattice applied in order over the frozen base,
// and Mur walls (rects on a 5 cm snap; drawn solids, they don't change the terrain).
// Pure: no React, no three, no I/O. Heights in m rel ±0.00, plan coords in m.
import { isOutside, sampleGrid, type HeightGrid } from '../terrain/grid';

/** Tile lattice (m), anchored at plan (0, 0) = the S-GRID-1 origin. */
export const LATTICE = 0.5;
/** Mur rects snap to this (m), so a 0.25 m wall can be drawn. */
export const WALL_SNAP = 0.05;
export const snapOf = (tool: Tool) => (tool === 'wall' ? WALL_SNAP : LATTICE);
/** Grid-corner tolerance (in cells) when a rect edge falls on a corner: edges included. */
const EPS = 1e-6;

/** x0 < x1, y0 < y1, all on the lattice. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
/** A rect being dragged; `z` = the height Wyrównaj will level it to. */
export type Draft = Rect & { z?: number; snap?: string };
/**
 * Corners inside the rect: Wyrównaj (`level`) sets them to `z`; Podnieś / Obniż (`raise` / `lower`) move them up /
 * down by `dz` > 0. Mur (`wall`): a solid over the rect from the lowest surface under it up to `top`; no terrain change.
 */
export type Edit = { id: string; rect: Rect; edges?: Edges; slope?: number } & (
  | { tool: 'level'; z: number; tilt?: Tilt }
  | { tool: 'raise' | 'lower'; dz: number }
  | { tool: 'wall'; top: number }
);
export type Tool = Edit['tool'];
export const TOOLS: readonly Tool[] = ['level', 'raise', 'lower', 'wall'];
/** Rect edges (PLAN.md §5 M4b): w = x0, e = x1, s = y0, n = y1 (←, →, ↓, ↑ in the Design top view). */
export type Side = 'w' | 'e' | 's' | 'n';
export const SIDES: readonly Side[] = ['w', 'e', 's', 'n'];
/** Uskok (step, as M4a) or Skarpa (slope 1:n outside the rect). Walls are drawn as their own edits (Mur). */
export type EdgeMode = 'step' | 'slope';
export const EDGE_MODES: readonly EdgeMode[] = ['step', 'slope'];
export type Edges = Record<Side, EdgeMode>;
export const ALL_STEP: Edges = { w: 'step', e: 'step', s: 'step', n: 'step' };
/** Skarpa 1:n default: n m horizontal per 1 m vertical. */
export const DEFAULT_SLOPE = 2;
export const edgesOf = (e: Edit): Edges => e.edges ?? ALL_STEP;
export const slopeOf = (e: Edit): number => e.slope ?? DEFAULT_SLOPE;

/**
 * Wyrównaj as a ramp (M4b): the rect's east edge is `x` m above its west edge, its north edge `y` m above its south
 * edge; `z` is the height at the rect's centre. Missing = flat.
 */
export type Tilt = { x: number; y: number };

/** Heights of the 4 edges (at their midpoints) of a Wyrównaj; flat = all z. */
export function edgeHeights(e: Edit & { tool: 'level' }): Record<Side, number> {
  const { x, y } = e.tilt ?? { x: 0, y: 0 };
  return { w: e.z - x / 2, e: e.z + x / 2, s: e.z - y / 2, n: e.z + y / 2 };
}

/** A Wyrównaj with one edge moved to height `h` (1 cm), the opposite edge kept: a ramp across the rect. */
export function withEdgeHeight(e: Edit & { tool: 'level' }, side: Side, h: number): Edit & { tool: 'level' } {
  const eh = edgeHeights(e);
  const t = e.tilt ?? { x: 0, y: 0 };
  if (side === 'w' || side === 'e') {
    const [lo, hi] = side === 'e' ? [eh.w, h] : [h, eh.e];
    return { ...e, z: (lo + hi) / 2, tilt: { x: hi - lo, y: t.y } };
  }
  const [lo, hi] = side === 'n' ? [eh.s, h] : [h, eh.n];
  return { ...e, z: (lo + hi) / 2, tilt: { x: t.x, y: hi - lo } };
}

/** Podnieś / Obniż default step (m). */
export const DEFAULT_DZ = 0.1;

/** The edit's number: z for Wyrównaj, top for Mur, dz for the others. */
export const editValue = (e: Edit) => (e.tool === 'level' ? e.z : e.tool === 'wall' ? e.top : e.dz);
export const withValue = (e: Edit, v: number): Edit =>
  e.tool === 'level' ? { ...e, z: v } : e.tool === 'wall' ? { ...e, top: v } : { ...e, dz: v };

/** The snap tiles (`step` m, default the 0.5 m lattice) touched by two plan points (a click gives one tile). */
export function snapRect(ax: number, ay: number, bx: number, by: number, step = LATTICE): Rect {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const lo = (v: number) => r(Math.floor(v / step) * step);
  const hi = (v: number) => r((Math.floor(v / step) + 1) * step);
  return { x0: lo(Math.min(ax, bx)), y0: lo(Math.min(ay, by)), x1: hi(Math.max(ax, bx)), y1: hi(Math.max(ay, by)) };
}

export const rectSize = (r: Rect) => ({ w: r.x1 - r.x0, h: r.y1 - r.y0, area: (r.x1 - r.x0) * (r.y1 - r.y0) });

/** Corner index ranges inside the rect (edges included), clamped to the grid; undefined if it misses the grid. */
function cornerRange(g: HeightGrid, r: Rect) {
  const i0 = Math.max(0, Math.ceil((r.x0 - g.origin.x) / g.cell - EPS));
  const i1 = Math.min(g.cols, Math.floor((r.x1 - g.origin.x) / g.cell + EPS));
  const j0 = Math.max(0, Math.ceil((r.y0 - g.origin.y) / g.cell - EPS));
  const j1 = Math.min(g.rows, Math.floor((r.y1 - g.origin.y) / g.cell + EPS));
  return i0 <= i1 && j0 <= j1 ? { i0, i1, j0, j1 } : undefined;
}

/** Surface height at a plan point, rounded to 1 cm (Wyrównaj's z: the height where the drag starts). */
export const heightAt = (g: HeightGrid, x: number, y: number) => Math.round(sampleGrid(g, x, y) * 100) / 100;

/** Cut / fill of one edit against the surface just before it (m³). */
export type EditVolume = { cut: number; fill: number };

/**
 * The version's surface: a copy of the frozen base with the edits applied in order (a later edit wins), and each
 * edit's cut / fill against the surface before it (its Skarpa included).
 */
export function replay(g: HeightGrid, edits: readonly Edit[]): { h: Float32Array; volumes: EditVolume[] } {
  const h = g.base.slice();
  const w = g.cols + 1;
  const a = g.cell * g.cell;
  const volumes = edits.map((e): EditVolume => {
    const c = cornerRange(g, e.rect);
    const v = { cut: 0, fill: 0 };
    if (!c || e.tool === 'wall') return v; // a wall doesn't change the terrain
    const set = (k: number, after: number) => {
      const before = h[k]!;
      h[k] = after;
      if (after > before) v.fill += (after - before) * a;
      else v.cut += (before - after) * a;
    };
    // Wyrównaj: z at the centre plus the ramp (tilt) across the rect.
    const t = e.tool === 'level' && e.tilt;
    const gx = t ? t.x / (e.rect.x1 - e.rect.x0) : 0;
    const gy = t ? t.y / (e.rect.y1 - e.rect.y0) : 0;
    const cx = (e.rect.x0 + e.rect.x1) / 2;
    const cy = (e.rect.y0 + e.rect.y1) / 2;
    for (let j = c.j0; j <= c.j1; j++) {
      for (let i = c.i0; i <= c.i1; i++) {
        const k = j * w + i;
        if (isOutside(g, k)) continue; // outside the modelled area: never edited
        const before = h[k]!;
        const after =
          e.tool === 'level'
            ? e.z + gx * (g.origin.x + i * g.cell - cx) + gy * (g.origin.y + j * g.cell - cy)
            : e.tool === 'raise'
              ? before + e.dz
              : before - e.dz;
        set(k, Math.fround(after));
      }
    }
    applySlope(g, h, c, edgesOf(e), slopeOf(e), set);
    return v;
  });
  return { h, volumes };
}

type Range = { i0: number; i1: number; j0: number; j1: number };

/**
 * Skarpa (PLAN.md §5 M4b): outside the rect, from the nearest rect-edge corner p at distance d, the surface becomes
 * max(h, top − d/n) where p is above it (fill) or min(h, top + d/n) where p is below it (cut), top = h(p) after the
 * edit. A side band follows its edge's mode; a corner zone is sloped only when both of its edges are Skarpa.
 */
function applySlope(g: HeightGrid, h: Float32Array, c: Range, edges: Edges, n: number, set: (k: number, v: number) => void) {
  if (!Object.values(edges).includes('slope')) return;
  const w = g.cols + 1;
  // Band width: far enough for the largest height difference between the edge tops and the surface.
  let topMin = Infinity, topMax = -Infinity, hMin = Infinity, hMax = -Infinity;
  for (let k = 0; k < h.length; k++) {
    if (isOutside(g, k)) continue;
    hMin = Math.min(hMin, h[k]!);
    hMax = Math.max(hMax, h[k]!);
  }
  for (let j = c.j0; j <= c.j1; j++) {
    for (let i = c.i0; i <= c.i1; i++) {
      if (i !== c.i0 && i !== c.i1 && j !== c.j0 && j !== c.j1) continue;
      const k = j * w + i;
      if (isOutside(g, k)) continue;
      topMin = Math.min(topMin, h[k]!);
      topMax = Math.max(topMax, h[k]!);
    }
  }
  if (topMin > topMax) return;
  const band = Math.ceil((n * Math.max(topMax - hMin, hMax - topMin, 0)) / g.cell) + 1;
  const I0 = Math.max(0, c.i0 - band), I1 = Math.min(g.cols, c.i1 + band);
  const J0 = Math.max(0, c.j0 - band), J1 = Math.min(g.rows, c.j1 + band);
  for (let j = J0; j <= J1; j++) {
    const sj = j < c.j0 ? edges.s : j > c.j1 ? edges.n : undefined;
    for (let i = I0; i <= I1; i++) {
      const si = i < c.i0 ? edges.w : i > c.i1 ? edges.e : undefined;
      if (si === undefined && sj === undefined) continue; // inside the rect
      if ((si ?? 'slope') !== 'slope' || (sj ?? 'slope') !== 'slope') continue;
      const k = j * w + i;
      const pi = Math.min(c.i1, Math.max(c.i0, i));
      const pj = Math.min(c.j1, Math.max(c.j0, j));
      const p = pj * w + pi;
      if (isOutside(g, k) || isOutside(g, p)) continue;
      const top = h[p]!;
      const drop = (g.cell * Math.hypot(i - pi, j - pj)) / n;
      const cur = h[k]!;
      const next = top > cur ? Math.max(cur, top - drop) : Math.min(cur, top + drop);
      if (next !== cur) set(k, Math.fround(next));
    }
  }
}

/** A height a dragged value snaps to, with what it is (shown in the bar). */
export type SnapTarget = { z: number; label: string };

/** The nearest target within `tol` (m) of z, else z itself. */
export function snapHeight(z: number, targets: readonly SnapTarget[], tol: number): { z: number; snap?: string } {
  let best: SnapTarget | undefined;
  for (const s of targets) if (Math.abs(s.z - z) <= tol && (!best || Math.abs(s.z - z) < Math.abs(best.z - z))) best = s;
  return best ? { z: best.z, snap: best.label } : { z };
}

/** A rect moved by (dx, dy) snapped to `step`. */
export function moveRect(r: Rect, dx: number, dy: number, step = LATTICE): Rect {
  const q = (v: number) => Math.round(Math.round(v / step) * step * 1000) / 1000;
  const sx = q(dx), sy = q(dy);
  const f = (v: number) => Math.round(v * 1000) / 1000;
  return { x0: f(r.x0 + sx), x1: f(r.x1 + sx), y0: f(r.y0 + sy), y1: f(r.y1 + sy) };
}

/** The rect with one side moved to plan coordinate v (snapped to `step`), at least one step wide. */
export function resizeRect(r: Rect, side: Side, v: number, step = LATTICE): Rect {
  const s = Math.round(Math.round(v / step) * step * 1000) / 1000;
  if (side === 'w') return { ...r, x0: Math.min(s, r.x1 - step) };
  if (side === 'e') return { ...r, x1: Math.max(s, r.x0 + step) };
  if (side === 's') return { ...r, y0: Math.min(s, r.y1 - step) };
  return { ...r, y1: Math.max(s, r.y0 + step) };
}

/**
 * Bilansuj: the Wyrównaj height (1 cm) at which edit `index` has its cut equal to its fill (slopes included),
 * against the surface just before it. Bisection; fill − cut grows with z.
 */
export function balanceZ(g: HeightGrid, edits: readonly Edit[], index: number): number | undefined {
  const e = edits[index];
  if (!e || e.tool !== 'level') return undefined;
  const before = { ...g, base: replay(g, edits.slice(0, index)).h };
  const net = (z: number) => {
    const v = replay(before, [{ ...e, z }]).volumes[0]!;
    return v.fill - v.cut;
  };
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < before.base.length; k++) {
    if (isOutside(g, k)) continue;
    lo = Math.min(lo, before.base[k]!);
    hi = Math.max(hi, before.base[k]!);
  }
  const t = e.tilt ? Math.abs(e.tilt.x) + Math.abs(e.tilt.y) : 0;
  lo -= t;
  hi += t;
  if (!(lo < hi)) return undefined;
  for (let n = 0; n < 30 && hi - lo > 0.002; n++) {
    const m = (lo + hi) / 2;
    if (net(m) > 0) hi = m;
    else lo = m;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

/** Against the frozen base, each corner standing for one cell area. m³. */
export type Totals = { cut: number; fill: number; net: number; changed: number };

export function totals(g: HeightGrid, h: Float32Array): Totals {
  const a = g.cell * g.cell;
  let cut = 0;
  let fill = 0;
  let changed = 0;
  for (let k = 0; k < h.length; k++) {
    const d = h[k]! - g.base[k]!;
    if (d === 0) continue;
    if (d > 0) fill += d * a;
    else cut -= d * a;
    changed++;
  }
  return { cut, fill, net: fill - cut, changed };
}

const onLattice = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6;

/** Strict parse of one saved edit; throws with the field at fault. */
export function parseEdit(v: unknown, where: string): Edit {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${where}: not an object`);
  const { id, tool, rect, z, dz, edges, slope, tilt, top } = v as Record<string, unknown>;
  if (typeof id !== 'string' || !id) throw new Error(`${where}.id: expected a string`);
  const r = rect as Record<string, unknown> | null;
  const ok =
    typeof r === 'object' &&
    r !== null &&
    [r.x0, r.y0, r.x1, r.y1].every((c) => Number.isFinite(c) && onLattice(c as number, tool === 'wall' ? WALL_SNAP : LATTICE)) &&
    (r.x0 as number) < (r.x1 as number) &&
    (r.y0 as number) < (r.y1 as number);
  if (!ok) throw new Error(`${where}.rect: expected { x0 < x1, y0 < y1 } on the ${tool === 'wall' ? WALL_SNAP : LATTICE} m snap`);
  const box = { x0: r.x0 as number, y0: r.y0 as number, x1: r.x1 as number, y1: r.y1 as number };
  const shape: { edges?: Edges; slope?: number } = {};
  if (edges !== undefined) {
    const ed = edges as Record<string, unknown> | null;
    // 'wall' was an edge mode during M4b development (walls are their own edits now): read as Uskok.
    const mode = (m: unknown) => (m === 'wall' ? 'step' : m) as EdgeMode;
    if (typeof ed !== 'object' || ed === null || !SIDES.every((k) => EDGE_MODES.includes(mode(ed[k]))))
      throw new Error(`${where}.edges: expected { w, e, s, n } of ${EDGE_MODES.join(' | ')}`);
    shape.edges = { w: mode(ed.w), e: mode(ed.e), s: mode(ed.s), n: mode(ed.n) };
  }
  if (slope !== undefined) {
    if (!(Number.isFinite(slope) && (slope as number) > 0)) throw new Error(`${where}.slope: expected a number > 0`);
    shape.slope = slope as number;
  }
  if (tool === 'level') {
    if (!Number.isFinite(z)) throw new Error(`${where}.z: expected a number`);
    if (tilt === undefined) return { id, tool, rect: box, ...shape, z: z as number };
    const tl = tilt as Record<string, unknown> | null;
    if (typeof tl !== 'object' || tl === null || !Number.isFinite(tl.x) || !Number.isFinite(tl.y))
      throw new Error(`${where}.tilt: expected { x, y } numbers`);
    return { id, tool, rect: box, ...shape, z: z as number, tilt: { x: tl.x as number, y: tl.y as number } };
  }
  if (tool === 'wall') {
    if (!Number.isFinite(top)) throw new Error(`${where}.top: expected a number`);
    return { id, tool, rect: box, top: top as number };
  }
  if (tool === 'raise' || tool === 'lower') {
    if (!(Number.isFinite(dz) && (dz as number) > 0)) throw new Error(`${where}.dz: expected a number > 0`);
    return { id, tool, rect: box, ...shape, dz: dz as number };
  }
  throw new Error(`${where}.tool: unknown "${String(tool)}"`);
}
