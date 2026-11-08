// Edit version files (PLAN.md §5 M4a, ADR 0003): `<id>.json` (meta + edits, parsed strictly) and `<id>.bin`
// (frozen grid, one entry per grid corner: base Float32 little-endian, then the outside mask Uint8 if the grid has one).
// File version 1 (before 2026-11-08) also had an `uncertain` Uint8 section after base; it is skipped on read. Pure, no I/O.
import type { HeightGrid } from '../terrain/grid';
import { parseEdit, type Edit } from './edits';

export type GridGeometry = { cell: number; origin: { x: number; y: number }; cols: number; rows: number };

/** `lift` (ADR 0007): the house lift its heights (the .bin and the edits) are relative to; missing = 0. */
export type VersionFile = { version: 1 | 2; id: string; name: string; created: string; grid: GridGeometry; edits: Edit[]; lift?: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** Ids are filenames: keep them to safe characters. */
export const isVersionId = (id: string) => /^[a-z0-9-]{1,40}$/.test(id);

export const corners = (g: GridGeometry) => (g.cols + 1) * (g.rows + 1);

export function parseVersionFile(text: string): VersionFile {
  const v: unknown = JSON.parse(text);
  if (!isObj(v)) throw new Error('not a JSON object');
  if (v.version !== 1 && v.version !== 2) throw new Error(`unsupported version ${String(v.version)} (expected 1 or 2)`);
  const { id, name, created, grid, edits } = v;
  if (typeof id !== 'string' || !isVersionId(id)) throw new Error('id: expected [a-z0-9-]');
  if (typeof name !== 'string' || !name.trim()) throw new Error('name: expected a non-empty string');
  if (typeof created !== 'string' || Number.isNaN(Date.parse(created))) throw new Error('created: expected an ISO date');
  if (
    !isObj(grid) ||
    !(Number.isFinite(grid.cell) && (grid.cell as number) > 0) ||
    !isObj(grid.origin) ||
    !Number.isFinite(grid.origin.x) ||
    !Number.isFinite(grid.origin.y) ||
    !isCount(grid.cols) ||
    !isCount(grid.rows)
  )
    throw new Error('grid: expected { cell > 0, origin: { x, y }, cols, rows }');
  if (!Array.isArray(edits)) throw new Error('edits: expected an array');
  const lift = v.lift ?? 0;
  if (typeof lift !== 'number' || !Number.isFinite(lift)) throw new Error('lift: expected a number');
  return {
    version: v.version,
    id,
    name,
    created,
    grid: { cell: grid.cell as number, origin: { x: grid.origin.x as number, y: grid.origin.y as number }, cols: grid.cols, rows: grid.rows },
    edits: edits.map((e, i) => parseEdit(e, `edits[${i}]`)),
    ...(lift !== 0 && { lift }),
  };
}

export const serializeVersionFile = (f: VersionFile) => JSON.stringify(f, null, 2) + '\n';

export function packGrid(g: HeightGrid): ArrayBuffer {
  const n = corners(g);
  const buf = new ArrayBuffer((g.outside ? 5 : 4) * n);
  const view = new DataView(buf);
  for (let k = 0; k < n; k++) view.setFloat32(4 * k, g.base[k]!, true);
  if (g.outside) new Uint8Array(buf, 4 * n, n).set(g.outside);
  return buf;
}

/** `.bin` of file version `fv` → grid of the JSON's geometry. Throws if the length doesn't match it. */
export function unpackGrid(buf: ArrayBuffer, geo: GridGeometry, fv: VersionFile['version']): HeightGrid {
  const n = corners(geo);
  const skip = fv === 1 ? n : 0; // v1: the old uncertain section
  const plain = (4 * n) + skip;
  if (buf.byteLength !== plain && buf.byteLength !== plain + n)
    throw new Error(`.bin: ${buf.byteLength} bytes, expected ${plain} or ${plain + n} for ${geo.cols} × ${geo.rows} cells`);
  const view = new DataView(buf);
  const base = new Float32Array(n);
  for (let k = 0; k < n; k++) base[k] = view.getFloat32(4 * k, true);
  const grid: HeightGrid = { ...geo, origin: { ...geo.origin }, base };
  if (buf.byteLength === plain + n) grid.outside = new Uint8Array(buf.slice(plain));
  return grid;
}
