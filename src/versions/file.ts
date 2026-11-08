// Edit version files (PLAN.md §5 M4a, ADR 0003): `<id>.json` (meta + edits, parsed strictly) and `<id>.bin`
// (frozen grid: base Float32 little-endian, then uncertain Uint8, then outside Uint8 if the grid has a mask, one entry
// per grid corner). Pure, no I/O.
import type { HeightGrid } from '../terrain/grid';
import { parseEdit, type Edit } from './edits';

export type GridGeometry = { cell: number; origin: { x: number; y: number }; cols: number; rows: number };

export type VersionFile = { version: 1; id: string; name: string; created: string; grid: GridGeometry; edits: Edit[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** Ids are filenames: keep them to safe characters. */
export const isVersionId = (id: string) => /^[a-z0-9-]{1,40}$/.test(id);

export const corners = (g: GridGeometry) => (g.cols + 1) * (g.rows + 1);

export function parseVersionFile(text: string): VersionFile {
  const v: unknown = JSON.parse(text);
  if (!isObj(v)) throw new Error('not a JSON object');
  if (v.version !== 1) throw new Error(`unsupported version ${String(v.version)} (expected 1)`);
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
  return {
    version: 1,
    id,
    name,
    created,
    grid: { cell: grid.cell as number, origin: { x: grid.origin.x as number, y: grid.origin.y as number }, cols: grid.cols, rows: grid.rows },
    edits: edits.map((e, i) => parseEdit(e, `edits[${i}]`)),
  };
}

export const serializeVersionFile = (f: VersionFile) => JSON.stringify(f, null, 2) + '\n';

export function packGrid(g: HeightGrid): ArrayBuffer {
  const n = corners(g);
  const buf = new ArrayBuffer((g.outside ? 6 : 5) * n);
  const view = new DataView(buf);
  for (let k = 0; k < n; k++) view.setFloat32(4 * k, g.base[k]!, true);
  new Uint8Array(buf, 4 * n, n).set(g.uncertain);
  if (g.outside) new Uint8Array(buf, 5 * n, n).set(g.outside);
  return buf;
}

/** `.bin` → grid of the JSON's geometry. Throws if the length doesn't match it. */
export function unpackGrid(buf: ArrayBuffer, geo: GridGeometry): HeightGrid {
  const n = corners(geo);
  if (buf.byteLength !== 5 * n && buf.byteLength !== 6 * n)
    throw new Error(`.bin: ${buf.byteLength} bytes, expected ${5 * n} or ${6 * n} for ${geo.cols} × ${geo.rows} cells`);
  const view = new DataView(buf);
  const base = new Float32Array(n);
  for (let k = 0; k < n; k++) base[k] = view.getFloat32(4 * k, true);
  const uncertain = new Uint8Array(buf.slice(4 * n, 5 * n));
  const grid: HeightGrid = { ...geo, origin: { ...geo.origin }, base, uncertain };
  if (buf.byteLength === 6 * n) grid.outside = new Uint8Array(buf.slice(5 * n));
  return grid;
}
