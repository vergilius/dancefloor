// Derived alignment of site sheets (M1c), shared by the sheet list and the 3D view.
// Cached per (sheet geometry, reference plan), so the same inputs give the same objects.
import type { NormalizedSheet } from '../dwg/types';
import { autoAlign, type AutoAlign, type Similarity2D } from '../project/align';
import { useProject } from './store';
import { referenceSummary, referenceOf, type Reference } from './vertical';

const cache = new WeakMap<NormalizedSheet, { ref: Reference; out: AutoAlign }>();

export function deriveSite(sheet: NormalizedSheet, ref: Reference): AutoAlign {
  const hit = cache.get(sheet);
  if (hit && hit.ref === ref) return hit.out;
  const out = autoAlign(sheet, ref.plan);
  cache.set(sheet, { ref, out });
  return out;
}

/** Derived transforms of site sheets that have none saved yet: "Zapisz" writes these (a saved one wins). */
export function unsavedTransforms(): Record<string, Similarity2D> {
  const st = useProject.getState();
  const summary = referenceSummary(st);
  if (!summary) return {};
  const ref = referenceOf(summary);
  const out: Record<string, Similarity2D> = {};
  for (const r of st.sheets) {
    const p = st.parsed[r.file];
    if (r.kind !== 'site' || r.transform || p?.status !== 'done') continue;
    const a = deriveSite(p.summary.sheet, ref);
    if (a.ok) out[r.file] = a.transform;
  }
  return out;
}
