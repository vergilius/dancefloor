// Derived alignment of site sheets (M1c), shared by the sheet list and the 3D view.
// Cached per (sheet geometry, reference plan), so the same inputs give the same objects.
import type { NormalizedSheet } from '../dwg/types';
import { autoAlign, type AutoAlign } from '../project/align';
import type { Reference } from './vertical';

const cache = new WeakMap<NormalizedSheet, { ref: Reference; out: AutoAlign }>();

export function deriveSite(sheet: NormalizedSheet, ref: Reference): AutoAlign {
  const hit = cache.get(sheet);
  if (hit && hit.ref === ref) return hit.out;
  const out = autoAlign(sheet, ref.plan);
  cache.set(sheet, { ref, out });
  return out;
}
