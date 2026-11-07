// Sheet/world coordinates → three.js scene. World: x east, y north, z up (m). Scene: y up, so
// (x, y, z) → (x, z, −y). Keeps the plan view unmirrored when looking down from +y with north at −z.
import { Box3, Vector3 } from 'three';

export const toScene = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

/** Plan segments [x1, y1, x2, y2, …] (sheet m) at height z → scene positions [x, y, z, …] for LineSegments. */
export function planPositions(segments: Float64Array, z: number): Float32Array {
  const out = new Float32Array((segments.length / 2) * 3);
  for (let i = 0, j = 0; i < segments.length; i += 2, j += 3) {
    out[j] = segments[i]!;
    out[j + 1] = z;
    out[j + 2] = -segments[i + 1]!;
  }
  return out;
}

type Extents = { minX: number; minY: number; maxX: number; maxY: number };

/** Scene-space box around plan extents at height z. */
export const planBox = (e: Extents, z: number) =>
  new Box3(new Vector3(...toScene(e.minX, e.maxY, z)), new Vector3(...toScene(e.maxX, e.minY, z)));
