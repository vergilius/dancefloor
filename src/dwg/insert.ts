// 2D affine transforms for INSERT expansion. Pure.
import type { InsertIn, P3 } from './types';

/** x' = a·x + c·y + e,  y' = b·x + d·y + f */
export type Mat = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m ∘ n: apply n first, then m. */
export function compose(m: Mat, n: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const [A, B, C, D, E, F] = n;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

export const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const rotate = (r: number): Mat => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];

/**
 * Block → parent transforms for one INSERT, one per MINSERT cell (rows × columns; usually 1).
 * Per cell: OCS · T(insertionPoint) · R(rotation) · T(cell offset) · S(xScale, yScale) · T(−basePoint).
 * The cell offset is rotated but not scaled. OCS: extrusion (0,0,−1) mirrors x.
 */
export function insertMatrices(e: InsertIn, basePoint: P3): Mat[] {
  const ocs: Mat = e.extrusionDirection && e.extrusionDirection.z < 0 ? scale(-1, 1) : IDENTITY;
  const head = compose(ocs, compose(translate(e.insertionPoint.x, e.insertionPoint.y), rotate(e.rotation)));
  const tail = compose(scale(e.xScale, e.yScale), translate(-basePoint.x, -basePoint.y));
  const rows = Math.max(1, e.rowCount || 1);
  const cols = Math.max(1, e.columnCount || 1);
  const out: Mat[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push(compose(head, compose(translate(c * (e.columnSpacing || 0), r * (e.rowSpacing || 0)), tail)));
  return out;
}
