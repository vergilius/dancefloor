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

// Plane position (perpendicular to `dir`): sections from their cut line on the plan, elevations from the plan's
// outermost wall on the viewer's side (PLAN.md §5 M1b).
export const CUT_LINE_LAYER = 'G-ANNO-SYMB-2';
export const CUT_LETTER_LAYER = 'G-ANNO-SYMB';
export const WALL_LAYER = 'A-WALL';
const JOIN_TOL = 0.001;

export type VerticalPlacement = { type: 'vertical'; origin: { x: number; y: number }; dir: { x: number; y: number } };

export type PlaneFailure = 'noLetter' | 'letterNotOnPlan' | 'noCutLine' | 'noWalls';

export type Plane =
  /** `value` is plan x (dir along y) or plan y (dir along x). */
  | { ok: true; value: number; source: 'cut' | 'wall'; letter?: string }
  | { ok: false; reason: PlaneFailure; letter?: string };

/** `PRZEKRÓJ B-B…` → `B`. NFC first: macOS may hand out decomposed filenames. */
export function sectionLetter(file: string): string | undefined {
  return /PRZEKR[OÓ]J\s+([A-Z])\s*-\s*\1/i.exec(file.normalize('NFC'))?.[1]?.toUpperCase();
}

function layerSegments(sheet: NormalizedSheet, name: string): Seg[] {
  const segs = sheet.layers.find((l) => l.name === name)?.segments;
  const out: Seg[] = [];
  if (segs) for (let i = 0; i + 3 < segs.length; i += 4) out.push({ x1: segs[i]!, y1: segs[i + 1]!, x2: segs[i + 2]!, y2: segs[i + 3]! });
  return out;
}

const touches = (a: Seg, b: Seg) =>
  [
    [a.x1, a.y1],
    [a.x2, a.y2],
  ].some(([x, y]) => Math.hypot(x! - b.x1, y! - b.y1) < JOIN_TOL || Math.hypot(x! - b.x2, y! - b.y2) < JOIN_TOL);

/** The segments connected end-to-end with `start` (a jogged cut line is one chain). */
function chain(start: Seg, all: Seg[]): Seg[] {
  const out = [start];
  const rest = all.filter((s) => s !== start);
  for (let i = 0; i < out.length; i++) {
    for (let j = rest.length - 1; j >= 0; j--) if (touches(out[i]!, rest[j]!)) out.push(...rest.splice(j, 1));
  }
  return out;
}

function sectionPlane(file: string, plan: NormalizedSheet, axis: PlanAxis): Plane {
  const letter = sectionLetter(file);
  if (!letter) return { ok: false, reason: 'noLetter' };
  const marks = plan.texts.filter((t) => t.layer === CUT_LETTER_LAYER && t.text.trim().toUpperCase() === letter);
  if (marks.length === 0) return { ok: false, reason: 'letterNotOnPlan', letter };
  const segs = layerSegments(plan, CUT_LINE_LAYER);
  let near: Seg | undefined;
  let nearD = Infinity;
  for (const m of marks)
    for (const s of segs) {
      const d = segDist({ text: letter, x: m.x, y: m.y }, s);
      if (d < nearD) [near, nearD] = [s, d];
    }
  if (!near) return { ok: false, reason: 'noCutLine', letter };
  // Parallel to dir: dir along plan x → horizontal segment, its y is the plane (and vice versa).
  const parallel = chain(near, segs).filter((s) =>
    axis === 'x' ? Math.abs(s.y2 - s.y1) < ALIGN_TOL : Math.abs(s.x2 - s.x1) < ALIGN_TOL,
  );
  const longest = parallel.reduce<Seg | undefined>(
    (a, s) => (!a || Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > Math.hypot(a.x2 - a.x1, a.y2 - a.y1) ? s : a),
    undefined,
  );
  if (!longest) return { ok: false, reason: 'noCutLine', letter };
  return { ok: true, value: axis === 'x' ? longest.y1 : longest.x1, source: 'cut', letter };
}

/** Viewer stands on the −look side: e.g. looking south → the plan's max y. */
function elevationPlane(plan: NormalizedSheet, look: Look): Plane {
  const segs = layerSegments(plan, WALL_LAYER);
  if (segs.length === 0) return { ok: false, reason: 'noWalls' };
  const xs = segs.flatMap((s) => [s.x1, s.x2]);
  const ys = segs.flatMap((s) => [s.y1, s.y2]);
  const value = { S: Math.max(...ys), N: Math.min(...ys), W: Math.max(...xs), E: Math.min(...xs) }[look];
  return { ok: true, value, source: 'wall' };
}

export function planeOf(file: string, kind: 'elevation' | 'section', plan: NormalizedSheet, fit: AxisFit & { ok: true }): Plane {
  return kind === 'section' ? sectionPlane(file, plan, fit.axis) : elevationPlane(plan, fit.look);
}

/** Sheet x = 0 lands on origin; plan point = origin + x·dir (PLAN.md §4). */
export function placementOf(fit: AxisFit & { ok: true }, plane: number): VerticalPlacement {
  const along = -fit.sign * fit.offset;
  return { type: 'vertical', origin: fit.axis === 'x' ? { x: along, y: plane } : { x: plane, y: along }, dir: fit.dir };
}
