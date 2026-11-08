// Terrain seed points from the existing-terrain profiles of elevations and sections (PLAN.md §5 M3). Pure.
import type { NormalizedSheet } from '../dwg/types';
import type { VerticalPlacement } from '../project/vertical';
import { sheetToWorld } from '../scene/coords';

export const PROFILE_LAYER = 'PZT_TEREN ISTNIEJĄCY';
/** Segment ends closer than this (m) are connected. */
const JOIN = 0.02;
/** Kept segments are split into pieces no longer than this (m). */
const STEP = 1;

/** Per sheet: profile segments found, dropped (no neighbour: legend samples, stubs) and the seed points made. */
export type SheetSeeds = { file: string; segments: number; dropped: { x1: number; x2: number; y: number }[]; points: number };
/** `points`: plan [x, y, h, …] (m, h rel ±0.00). Ends shared by two segments appear twice; the grid merges them. */
export type Seeds = { points: Float64Array; sheets: SheetSeeds[] };

export function profileSeeds(sheets: { file: string; placement: VerticalPlacement; sheet: NormalizedSheet }[]): Seeds {
  const out: number[] = [];
  const stats: SheetSeeds[] = [];
  for (const { file, placement, sheet } of sheets) {
    const s = sheet.layers.find((l) => l.name === PROFILE_LAYER)?.segments;
    if (!s || s.length === 0) continue;
    const n = s.length / 4;
    const start = out.length;
    const dropped: SheetSeeds['dropped'] = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1, x2, y2] = [s[4 * i]!, s[4 * i + 1]!, s[4 * i + 2]!, s[4 * i + 3]!];
      if (!hasNeighbour(s, i)) {
        dropped.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), y: (y1 + y2) / 2 });
        continue;
      }
      const k = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / STEP));
      for (let j = 0; j <= k; j++) out.push(...sheetToWorld(placement, x1 + ((x2 - x1) * j) / k, y1 + ((y2 - y1) * j) / k));
    }
    stats.push({ file, segments: n, dropped, points: (out.length - start) / 3 });
  }
  return { points: Float64Array.from(out), sheets: stats };
}

/** The segments of `s` that share an end with another one (drops legend samples and stubs). */
export function connectedSegments(s: Float64Array): Float64Array {
  const out: number[] = [];
  for (let i = 0; i < s.length / 4; i++) if (hasNeighbour(s, i)) out.push(s[4 * i]!, s[4 * i + 1]!, s[4 * i + 2]!, s[4 * i + 3]!);
  return Float64Array.from(out);
}

/** Does segment i share an end (within JOIN) with any other segment? `s` = [x1, y1, x2, y2, …]. */
function hasNeighbour(s: Float64Array, i: number): boolean {
  for (let e = 0; e < 2; e++) {
    const x = s[4 * i + 2 * e]!;
    const y = s[4 * i + 2 * e + 1]!;
    for (let j = 0; j < s.length / 4; j++) {
      if (j === i) continue;
      for (let f = 0; f < 2; f++) if (Math.hypot(s[4 * j + 2 * f]! - x, s[4 * j + 2 * f + 1]! - y) <= JOIN) return true;
    }
  }
  return false;
}
