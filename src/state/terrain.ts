// Existing terrain derived from the drawn sheets (PLAN.md §5 M3, ADR 0002: generated, never saved).
import { useMemo } from 'react';
import { profileSeeds, type Seeds } from '../terrain/seeds';
import { useDrawnSheets } from './drawn';

export function useTerrainSeeds(): Seeds {
  const drawn = useDrawnSheets();
  return useMemo(
    () => profileSeeds(drawn.flatMap((d) => (d.placement.type === 'vertical' ? [{ file: d.file, placement: d.placement, sheet: d.sheet }] : []))),
    [drawn],
  );
}
