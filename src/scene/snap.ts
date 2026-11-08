// Endpoint snapping for the 2-point tool (PLAN.md §5 M1c) and the measure tool (M2). Pure.
import type { NormalizedSheet } from '../dwg/types';
import { apply, invert, type Vec2 } from '../project/align';
import { sheetToWorld, type HorizontalPlacement, type SheetPlacement } from './coords';

/** Segment endpoints of a horizontal sheet's visible layers: sheet coords and plan coords, [x, y, …] each. */
export type Endpoints = { sheet: Float64Array; world: Float64Array };

export function endpoints(sheet: NormalizedSheet, placement: HorizontalPlacement, visible: (layer: string) => boolean): Endpoints {
  const layers = sheet.layers.filter((l) => visible(l.name));
  const n = layers.reduce((a, l) => a + l.segments.length, 0);
  const out = { sheet: new Float64Array(n), world: new Float64Array(n) };
  let j = 0;
  for (const l of layers)
    for (let i = 0; i < l.segments.length; i += 2, j += 2) {
      const x = l.segments[i]!;
      const y = l.segments[i + 1]!;
      const [wx, wy] = sheetToWorld(placement, x, y);
      out.sheet[j] = x;
      out.sheet[j + 1] = y;
      out.world[j] = wx;
      out.world[j + 1] = wy;
    }
  return out;
}

/** Index (into [x, y, …] pairs) of the point nearest p within r, or −1. */
export function nearest(points: Float64Array, p: Vec2, r: number): number {
  let best = -1;
  let bestD = r * r;
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i]! - p.x;
    const dy = points[i + 1]! - p.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i / 2;
    }
  }
  return best;
}

/** Snap radius in screen px. */
export const SNAP_PX = 12;
/** A click that moved more than this (px) was a pan, not a pick. */
export const CLICK_PX = 4;

export type Vec3 = [number, number, number];

/** Segment endpoints of a sheet's visible layers in world coords, [x, y, z, …]. */
export function worldPoints(sheet: NormalizedSheet, placement: SheetPlacement, visible: (layer: string) => boolean): Float64Array {
  const layers = sheet.layers.filter((l) => visible(l.name));
  const out = new Float64Array(layers.reduce((a, l) => a + l.segments.length, 0) * 1.5);
  let j = 0;
  for (const l of layers)
    for (let i = 0; i < l.segments.length; i += 2, j += 3) out.set(sheetToWorld(placement, l.segments[i]!, l.segments[i + 1]!), j);
  return out;
}

type Ray = { origin: Vec3; dir: Vec3 };
type Extents = NonNullable<NormalizedSheet['extents']>;

/**
 * Ray (scene coords) against a horizontal sheet's plane, inside the sheet's extents. Returns the distance along the
 * ray and the world point, or undefined.
 */
export function hitHorizontal(ray: Ray, placement: HorizontalPlacement, extents: Extents): { t: number; world: Vec3 } | undefined {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.dir;
  if (Math.abs(dy) < 1e-9) return undefined;
  const t = (placement.z - oy) / dy;
  if (t < 0) return undefined;
  // Scene (x, y, z) → world (x, −z, y), see coords.ts.
  const world: Vec3 = [ox + t * dx, -(oz + t * dz), placement.z];
  const s = placement.transform ? apply(invert(placement.transform), { x: world[0], y: world[1] }) : { x: world[0], y: world[1] };
  if (s.x < extents.minX || s.x > extents.maxX || s.y < extents.minY || s.y > extents.maxY) return undefined;
  return { t, world };
}

/**
 * Nearest world point (sets of [x, y, z, …]) to the pointer on screen, within r px. `m` = projection × view matrix
 * elements (column-major), `pointer` in px from the half's top left, `w` × `h` the half's size in px.
 */
export function nearestOnScreen(sets: Float64Array[], m: ArrayLike<number>, pointer: [number, number], w: number, h: number, r: number): Vec3 | undefined {
  let best: Vec3 | undefined;
  let bestD = r * r;
  for (const pts of sets)
    for (let i = 0; i < pts.length; i += 3) {
      // World → scene (x, z, −y), then clip space.
      const x = pts[i]!;
      const y = pts[i + 2]!;
      const z = -pts[i + 1]!;
      const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
      if (cw <= 0) continue;
      const px = ((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / cw + 1) * 0.5 * w - pointer[0];
      const py = (1 - (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / cw) * 0.5 * h - pointer[1];
      const d = px * px + py * py;
      if (d <= bestD) {
        bestD = d;
        best = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
      }
    }
  return best;
}
