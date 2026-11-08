// Terrain edits of a version (PLAN.md §5 M4a): rects on a 0.5 m lattice applied in order over the frozen base.
// Pure: no React, no three, no I/O. Heights in m rel ±0.00, plan coords in m.
import { isOutside, type HeightGrid } from '../terrain/grid';

/** Tile lattice (m), anchored at plan (0, 0) = the S-GRID-1 origin. */
export const LATTICE = 0.5;
/** Grid-corner tolerance (in cells) when a rect edge falls on a corner: edges included. */
const EPS = 1e-6;

/** x0 < x1, y0 < y1, all on the lattice. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
/**
 * Corners inside the rect: Wyrównaj (`level`) sets them to `z`; Podnieś / Obniż (`raise` / `lower`) move them up /
 * down by `dz` > 0.
 */
export type Edit = { id: string; rect: Rect } & ({ tool: 'level'; z: number } | { tool: 'raise' | 'lower'; dz: number });
export type Tool = Edit['tool'];
export const TOOLS: readonly Tool[] = ['level', 'raise', 'lower'];
/** Podnieś / Obniż default step (m). */
export const DEFAULT_DZ = 0.1;

/** The edit's number: z for Wyrównaj, dz for the others. */
export const editValue = (e: Edit) => (e.tool === 'level' ? e.z : e.dz);
export const withValue = (e: Edit, v: number): Edit => (e.tool === 'level' ? { ...e, z: v } : { ...e, dz: v });

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

/** Mean height of the corners inside the rect (and the modelled area), rounded to 1 cm (Wyrównaj's default z). */
export function meanUnder(g: HeightGrid, h: Float32Array, r: Rect): number | undefined {
  const c = cornerRange(g, r);
  if (!c) return undefined;
  const w = g.cols + 1;
  let sum = 0;
  let n = 0;
  for (let j = c.j0; j <= c.j1; j++) {
    for (let i = c.i0; i <= c.i1; i++) {
      if (isOutside(g, j * w + i)) continue;
      sum += h[j * w + i]!;
      n++;
    }
  }
  return n ? Math.round((sum / n) * 100) / 100 : undefined;
}

/** Cut / fill of one edit against the surface just before it (m³). */
export type EditVolume = { cut: number; fill: number };

/**
 * The version's surface: a copy of the frozen base with the edits applied in order (a later edit wins), and each
 * edit's cut / fill against the surface before it.
 */
export function replay(g: HeightGrid, edits: readonly Edit[]): { h: Float32Array; volumes: EditVolume[] } {
  const h = g.base.slice();
  const w = g.cols + 1;
  const a = g.cell * g.cell;
  const volumes = edits.map((e): EditVolume => {
    const c = cornerRange(g, e.rect);
    const v = { cut: 0, fill: 0 };
    if (!c) return v;
    for (let j = c.j0; j <= c.j1; j++) {
      for (let i = c.i0; i <= c.i1; i++) {
        const k = j * w + i;
        if (isOutside(g, k)) continue; // outside the modelled area: never edited
        const before = h[k]!;
        const after = Math.fround(e.tool === 'level' ? e.z : e.tool === 'raise' ? before + e.dz : before - e.dz);
        h[k] = after;
        if (after > before) v.fill += (after - before) * a;
        else v.cut += (before - after) * a;
      }
    }
    return v;
  });
  return { h, volumes };
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

const onLattice = (v: number) => Math.abs(v / LATTICE - Math.round(v / LATTICE)) < 1e-6;

/** Strict parse of one saved edit; throws with the field at fault. */
export function parseEdit(v: unknown, where: string): Edit {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${where}: not an object`);
  const { id, tool, rect, z, dz } = v as Record<string, unknown>;
  if (typeof id !== 'string' || !id) throw new Error(`${where}.id: expected a string`);
  const r = rect as Record<string, unknown> | null;
  const ok =
    typeof r === 'object' &&
    r !== null &&
    [r.x0, r.y0, r.x1, r.y1].every((c) => Number.isFinite(c) && onLattice(c as number)) &&
    (r.x0 as number) < (r.x1 as number) &&
    (r.y0 as number) < (r.y1 as number);
  if (!ok) throw new Error(`${where}.rect: expected { x0 < x1, y0 < y1 } on the ${LATTICE} m lattice`);
  const box = { x0: r.x0 as number, y0: r.y0 as number, x1: r.x1 as number, y1: r.y1 as number };
  if (tool === 'level') {
    if (!Number.isFinite(z)) throw new Error(`${where}.z: expected a number`);
    return { id, tool, rect: box, z: z as number };
  }
  if (tool === 'raise' || tool === 'lower') {
    if (!(Number.isFinite(dz) && (dz as number) > 0)) throw new Error(`${where}.dz: expected a number > 0`);
    return { id, tool, rect: box, dz: dz as number };
  }
  throw new Error(`${where}.tool: unknown "${String(tool)}"`);
}
