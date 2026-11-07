// Vertical sheets (elevations, sections): axis mapping from grid labels (PLAN.md §5 M1b). Pure.
// Each S-GRID-IDEN label sits at the end of an S-GRID-1 grid line. On the reference plan a label gives a plan
// coordinate (vertical line → plan x, horizontal → plan y); on a vertical sheet it gives a sheet x.
// Fit sheet x = s·p + t with s = ±1.
import type { NormalizedSheet } from '../dwg/types';

export const GRID_LAYER = 'S-GRID-1';
export const GRID_LABEL_LAYER = 'S-GRID-IDEN';
/** Max fit residual (m) before a sheet is flagged. */
export const MAX_RESIDUAL = 0.005;

type Seg = { x1: number; y1: number; x2: number; y2: number };
type Label = { text: string; x: number; y: number };
export type PlanAxis = 'x' | 'y';

/** Axis-aligned grid lines only: bubbles and other short strokes are ignored. */
const MIN_LINE = 0.5;
const ALIGN_TOL = 1e-4;

function gridSegments(sheet: NormalizedSheet): Seg[] {
  const segs = sheet.layers.find((l) => l.name === GRID_LAYER)?.segments;
  const out: Seg[] = [];
  if (!segs) return out;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const s = { x1: segs[i]!, y1: segs[i + 1]!, x2: segs[i + 2]!, y2: segs[i + 3]! };
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    if (Math.hypot(dx, dy) >= MIN_LINE && (dx < ALIGN_TOL || dy < ALIGN_TOL)) out.push(s);
  }
  return out;
}

function gridLabels(sheet: NormalizedSheet): Label[] {
  return sheet.texts
    .filter((t) => t.layer === GRID_LABEL_LAYER && t.text.trim() !== '')
    .map((t) => ({ text: t.text.trim(), x: t.x, y: t.y }));
}

function segDist(l: Label, s: Seg): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const u = Math.max(0, Math.min(1, ((l.x - s.x1) * dx + (l.y - s.y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(l.x - (s.x1 + u * dx), l.y - (s.y1 + u * dy));
}

function nearest(l: Label, segs: Seg[]): Seg | undefined {
  let best: Seg | undefined;
  let bestD = Infinity;
  for (const s of segs) {
    const d = segDist(l, s);
    if (d < bestD) [best, bestD] = [s, d];
  }
  return best;
}

const isVertical = (s: Seg) => Math.abs(s.x2 - s.x1) < ALIGN_TOL;

/** Reference plan: label → the plan axis and coordinate of its grid line (first bubble wins). */
export type PlanGrid = Map<string, { axis: PlanAxis; value: number }>;

export function planGrid(plan: NormalizedSheet): PlanGrid {
  const segs = gridSegments(plan);
  const grid: PlanGrid = new Map();
  for (const l of gridLabels(plan)) {
    const s = nearest(l, segs);
    if (!s || grid.has(l.text)) continue;
    grid.set(l.text, isVertical(s) ? { axis: 'x', value: s.x1 } : { axis: 'y', value: s.y1 });
  }
  return grid;
}

export type Look = 'N' | 'E' | 'S' | 'W';

export type AxisFit =
  | {
      ok: true;
      axis: PlanAxis;
      /** Sheet x = sign·p + offset (p = plan coordinate on `axis`). */
      sign: 1 | -1;
      offset: number;
      /** Unit vector in plan coords along sheet +x (PLAN.md §4 `dir`). */
      dir: { x: number; y: number };
      look: Look;
      matched: number;
      labels: number;
      residual: number;
    }
  | { ok: false; reason: AxisFitFailure; matched: number; labels: number; residual?: number };

export type AxisFitFailure = 'noLabels' | 'tooFewMatches' | 'mixedAxes' | 'residual';

/** Viewer looks along (−dir.y, dir.x) (PLAN.md §4). */
function lookOf(dir: { x: number; y: number }): Look {
  const lx = -dir.y;
  const ly = dir.x;
  return Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'E' : 'W') : ly > 0 ? 'N' : 'S';
}

export function fitAxis(sheet: NormalizedSheet, grid: PlanGrid): AxisFit {
  const segs = gridSegments(sheet).filter(isVertical);
  const labels = gridLabels(sheet);
  const names = new Set(labels.map((l) => l.text));
  const pairs: { p: number; x: number; axis: PlanAxis; text: string }[] = [];
  for (const l of labels) {
    const ref = grid.get(l.text);
    const s = nearest(l, segs);
    if (ref && s) pairs.push({ p: ref.value, x: s.x1, axis: ref.axis, text: l.text });
  }
  const matched = new Set(pairs.map((q) => q.text)).size;
  const base = { matched, labels: names.size };
  if (names.size === 0) return { ok: false, reason: 'noLabels', ...base };
  if (matched < 2) return { ok: false, reason: 'tooFewMatches', ...base };
  const axis = pairs[0]!.axis;
  if (pairs.some((q) => q.axis !== axis)) return { ok: false, reason: 'mixedAxes', ...base };

  let best: { sign: 1 | -1; offset: number; residual: number } | undefined;
  for (const sign of [1, -1] as const) {
    const offset = pairs.reduce((a, q) => a + q.x - sign * q.p, 0) / pairs.length;
    const residual = Math.max(...pairs.map((q) => Math.abs(q.x - sign * q.p - offset)));
    if (!best || residual < best.residual) best = { sign, offset, residual };
  }
  const { sign, offset, residual } = best!;
  if (residual > MAX_RESIDUAL) return { ok: false, reason: 'residual', residual, ...base };
  const dir = axis === 'x' ? { x: sign, y: 0 } : { x: 0, y: sign };
  return { ok: true, axis, sign, offset, dir, look: lookOf(dir), residual, ...base };
}
