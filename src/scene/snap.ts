// Endpoint snapping for the 2-point tool (PLAN.md §5 M1c). Pure.
import type { NormalizedSheet } from '../dwg/types';
import type { Vec2 } from '../project/align';
import { sheetToWorld, type HorizontalPlacement } from './coords';

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
