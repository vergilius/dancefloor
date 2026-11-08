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

/** The reference value, or undefined (heights are then shown relative only). */
export function useRefValue(): number | undefined {
  const r = useLevelReference();
  return r.ok ? r.value : undefined;
}
