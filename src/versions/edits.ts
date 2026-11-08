// Terrain edits of a version (PLAN.md §5 M4a): rects on a 0.5 m lattice applied in order over the frozen base.
// Pure: no React, no three, no I/O. Heights in m rel ±0.00, plan coords in m.
import type { HeightGrid } from '../terrain/grid';

/** Tile lattice (m), anchored at plan (0, 0) = the S-GRID-1 origin. */
export const LATTICE = 0.5;
/** Grid-corner tolerance (in cells) when a rect edge falls on a corner: edges included. */
const EPS = 1e-6;

/** x0 < x1, y0 < y1, all on the lattice. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
/** Wyrównaj: every corner inside the rect is set to `z`. Podnieś / Obniż follow in T3. */
export type Edit = { id: string; tool: 'level'; rect: Rect; z: number };

/** The lattice tiles touched by two plan points (a click gives one tile). */
export function snapRect(ax: number, ay: number, bx: number, by: number): Rect {
  const lo = (v: number) => Math.floor(v / LATTICE) * LATTICE;
  const hi = (v: number) => (Math.floor(v / LATTICE) + 1) * LATTICE;
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

/** Mean height of the corners inside the rect, rounded to 1 cm (Wyrównaj's default z). */
export function meanUnder(g: HeightGrid, h: Float32Array, r: Rect): number | undefined {
  const c = cornerRange(g, r);
  if (!c) return undefined;
  const w = g.cols + 1;
  let sum = 0;
  let n = 0;
  for (let j = c.j0; j <= c.j1; j++) for (let i = c.i0; i <= c.i1; i++, n++) sum += h[j * w + i]!;
  return Math.round((sum / n) * 100) / 100;
}

/** The version's surface: a copy of the frozen base with the edits applied in order (a later edit wins). */
export function applyEdits(g: HeightGrid, edits: readonly Edit[]): Float32Array {
  const h = g.base.slice();
  const w = g.cols + 1;
  for (const e of edits) {
    const c = cornerRange(g, e.rect);
    if (!c) continue;
    for (let j = c.j0; j <= c.j1; j++) for (let i = c.i0; i <= c.i1; i++) h[j * w + i] = e.z;
  }
  return h;
}

/** Against the frozen base, each corner standing for one cell area. m³; `uncertainShare` = changed corners on uncertain terrain (0–1). */
export type Totals = { cut: number; fill: number; net: number; changed: number; uncertainShare: number };

export function totals(g: HeightGrid, h: Float32Array): Totals {
  const a = g.cell * g.cell;
  let cut = 0;
  let fill = 0;
  let changed = 0;
  let unsure = 0;
  for (let k = 0; k < h.length; k++) {
    const d = h[k]! - g.base[k]!;
    if (d === 0) continue;
    if (d > 0) fill += d * a;
    else cut -= d * a;
    changed++;
    unsure += g.uncertain[k]!;
  }
  return { cut, fill, net: fill - cut, changed, uncertainShare: changed ? unsure / changed : 0 };
}

const onLattice = (v: number) => Math.abs(v / LATTICE - Math.round(v / LATTICE)) < 1e-6;

/** Strict parse of one saved edit; throws with the field at fault. */
export function parseEdit(v: unknown, where: string): Edit {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${where}: not an object`);
  const { id, tool, rect, z } = v as Record<string, unknown>;
  if (typeof id !== 'string' || !id) throw new Error(`${where}.id: expected a string`);
  if (tool !== 'level') throw new Error(`${where}.tool: unknown "${String(tool)}"`);
  if (!Number.isFinite(z)) throw new Error(`${where}.z: expected a number`);
  const r = rect as Record<string, unknown> | null;
  const ok =
    typeof r === 'object' &&
    r !== null &&
    [r.x0, r.y0, r.x1, r.y1].every((c) => Number.isFinite(c) && onLattice(c as number)) &&
    (r.x0 as number) < (r.x1 as number) &&
    (r.y0 as number) < (r.y1 as number);
  if (!ok) throw new Error(`${where}.rect: expected { x0 < x1, y0 < y1 } on the ${LATTICE} m lattice`);
  return { id, tool, rect: { x0: r.x0 as number, y0: r.y0 as number, x1: r.x1 as number, y1: r.y1 as number }, z: z as number };
}
