// The ±0.00 reference over all parsed sheets (PLAN.md §5 M2).
import { useMemo } from 'react';
import { levelReference, type LevelReference } from '../project/levels';
import { useProject } from './store';

export function useLevelReference(): LevelReference {
  const parsed = useProject((s) => s.parsed);
  return useMemo(
    () =>
      levelReference(
        Object.entries(parsed).flatMap(([file, p]) => (p.status === 'done' ? [{ file, references: p.summary.labels.references }] : [])),
      ),
    [parsed],
  );
}

/**
 * The as-built ±0.00 (m a.s.l.): the drawings' reference + the house lift (ADR 0007), or undefined (heights are then
 * shown relative only). Every relative height in the app is relative to it; absolute labels are read against it.
 */
export function useRefValue(): number | undefined {
  const r = useLevelReference();
  const lift = useHouseLift();
  return r.ok ? r.value + lift : undefined;
}

/** As-built house lift (m), 0 when not set. */
export const useHouseLift = () => useProject((s) => s.house.lift ?? 0);
