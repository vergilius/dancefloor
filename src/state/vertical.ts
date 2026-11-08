// Derived placement of vertical sheets (M1b), shared by the sheet list and the 3D view.
// Results are cached per (sheet geometry, reference plan geometry), so the same inputs give the same objects:
// SheetObject rebuilds its geometry only when the placement object changes.
import type { NormalizedSheet } from '../dwg/types';
import {
  fitAxis,
  placementOf,
  planeOf,
  planGrid,
  type AxisFit,
  type Plane,
  type PlanGrid,
  type VerticalPlacement,
} from '../project/vertical';
import type { Sheet } from '../project/projectFile';
import type { ParseSummary } from '../worker/protocol';
import { useProject, type ProjectState } from './store';

export type VerticalKind = 'elevation' | 'section';
export const isVertical = (kind: string): kind is VerticalKind => kind === 'elevation' || kind === 'section';

export type Reference = { file: string; plan: NormalizedSheet; grid: PlanGrid };
export type Derived = { fit: AxisFit; plane?: Plane; placement?: VerticalPlacement };

/** The reference plan: the first parsed plan at z = 0 (PLAN.md §5 M1b). */
export const referenceSummary = (st: ProjectState) => {
  const row = st.sheets.find((r) => r.kind === 'plan' && r.placement?.type === 'horizontal' && r.placement.z === 0);
  const p = row && st.parsed[row.file];
  return p?.status === 'done' ? p.summary : undefined;
};

const refCache = new WeakMap<NormalizedSheet, Reference>();

/** Same object for the same parsed plan in every component, so `deriveVertical`'s cache holds. */
export function useReference(): Reference | undefined {
  const summary = useProject(referenceSummary);
  return summary && referenceOf(summary);
}

export function referenceOf(summary: ParseSummary): Reference {
  let ref = refCache.get(summary.sheet);
  if (!ref || ref.file !== summary.name) {
    ref = { file: summary.name, plan: summary.sheet, grid: planGrid(summary.sheet) };
    refCache.set(summary.sheet, ref);
  }
  return ref;
}

const cache = new WeakMap<NormalizedSheet, { ref: Reference; key: string; out: Derived }>();

/** Saved placement if there is one, else the derived one (PLAN.md §5 M1b: derive only when none is saved). */
export function placementFor(row: { placement?: Sheet['placement'] }, derived: Derived): VerticalPlacement | undefined {
  return row.placement?.type === 'vertical' ? row.placement : derived.placement;
}

/** Derived placements of vertical sheets that have none saved yet: "Zapisz" writes these. */
export function unsavedPlacements(): Record<string, VerticalPlacement> {
  const st = useProject.getState();
  const summary = referenceSummary(st);
  if (!summary) return {};
  const ref = referenceOf(summary);
  const out: Record<string, VerticalPlacement> = {};
  for (const r of st.sheets) {
    const p = st.parsed[r.file];
    if (!isVertical(r.kind) || r.placement || p?.status !== 'done') continue;
    const placement = deriveVertical(r.file, r.kind, p.summary.sheet, ref).placement;
    if (placement) out[r.file] = placement;
  }
  return out;
}

export function deriveVertical(file: string, kind: VerticalKind, sheet: NormalizedSheet, ref: Reference): Derived {
  const key = `${file}|${kind}`;
  const hit = cache.get(sheet);
  if (hit && hit.ref === ref && hit.key === key) return hit.out;
  const fit = fitAxis(sheet, ref.grid);
  const plane = fit.ok ? planeOf(file, kind, ref.plan, fit) : undefined;
  const placement = fit.ok && plane?.ok ? placementOf(fit, plane.value) : undefined;
  const out = { fit, plane, placement };
  cache.set(sheet, { ref, key, out });
  return out;
}
