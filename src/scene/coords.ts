// Sheet/world coordinates → three.js scene. World: x east, y north, z up (m). Scene: y up, so
// (x, y, z) → (x, z, −y). Keeps the plan view unmirrored when looking down from +y with north at −z.
import { Box3, Vector3 } from 'three';
import { apply, type Similarity2D } from '../project/align';
import type { Placement } from '../project/projectFile';
import type { VerticalPlacement } from '../project/vertical';

export const toScene = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

/** Horizontal sheet at `z`; `transform` (sheet → plan, site/PDF sheets) defaults to identity. */
export type HorizontalPlacement = Placement & { transform?: Similarity2D };
/** How a sheet's 2D (x, y) lands in the world (PLAN.md §4). */
export type SheetPlacement = HorizontalPlacement | VerticalPlacement;

/** Sheet point → world (x, y, z). Horizontal: through `transform`. Vertical: plan point origin + x·dir, height y. */
export function sheetToWorld(p: SheetPlacement, x: number, y: number): [number, number, number] {
  if (p.type === 'vertical') return [p.origin.x + x * p.dir.x, p.origin.y + x * p.dir.y, y];
  if (!p.transform) return [x, y, p.z];
  const q = apply(p.transform, { x, y });
  return [q.x, q.y, p.z];
}

/** Sheet segments [x1, y1, x2, y2, …] (m) → scene positions [x, y, z, …] for LineSegments. */
export function sheetPositions(segments: Float64Array, p: SheetPlacement): Float32Array {
  const out = new Float32Array((segments.length / 2) * 3);
  for (let i = 0, j = 0; i < segments.length; i += 2, j += 3) {
    const [x, y, z] = sheetToWorld(p, segments[i]!, segments[i + 1]!);
    out[j] = x;
    out[j + 1] = z;
    out[j + 2] = -y;
  }
  return out;
}

type Extents = { minX: number; minY: number; maxX: number; maxY: number };

/** Scene-space box around a sheet's extents as placed. */
export function sheetBox(e: Extents, p: SheetPlacement): Box3 {
  const box = new Box3();
  for (const [x, y] of [
    [e.minX, e.minY],
    [e.maxX, e.minY],
    [e.minX, e.maxY],
    [e.maxX, e.maxY],
  ] as const)
    box.expandByPoint(new Vector3(...toScene(...sheetToWorld(p, x, y))));
  return box;
}
