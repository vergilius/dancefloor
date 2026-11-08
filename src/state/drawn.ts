// The sheets drawn in 3D and where (PLAN.md §5 M1). Shared by the viewport and the terrain panel (M3).
import { useMemo } from 'react';
import type { NormalizedSheet } from '../dwg/types';
import type { LayerOverrides } from '../project/layerGroups';
import type { SheetKind } from '../project/projectFile';
import type { SheetPlacement } from '../scene/coords';
import { deriveSite } from './site';
import { useProject } from './store';
import { deriveVertical, isVertical, placementFor, useReference } from './vertical';

// One colour per stacked plan, in sheet order, so the levels are easy to tell apart. Vertical sheets get their own set.
const PLAN_COLORS = ['#1f6feb', '#d1242f', '#1a7f37', '#8250df', '#bf8700'];
const VERTICAL_COLORS = ['#57606a', '#bc4c00', '#0a7480', '#953800', '#6e40c9', '#4d2d00', '#116329'];
const SITE_COLORS = ['#6e7781', '#a40e26'];

export type DrawnSheet = { file: string; kind: SheetKind; placement: SheetPlacement; sheet: NormalizedSheet; layers?: LayerOverrides; color: string };

/**
 * Plans at their z, vertical sheets that were placed (flagged ones aren't drawn, PLAN.md §5 M1b), and site sheets
 * at z 0 through their saved or automatic alignment (identity if neither, PLAN.md §5 M1c). Memoized, so the
 * placements are stable while the sheets don't change.
 */
export function useDrawnSheets(): DrawnSheet[] {
  const sheets = useProject((s) => s.sheets);
  const parsed = useProject((s) => s.parsed);
  const ref = useReference();
  return useMemo(() => {
    let plans = 0;
    let verticals = 0;
    let sites = 0;
    return sheets.flatMap((s): DrawnSheet[] => {
      const p = parsed[s.file];
      if (p?.status !== 'done') return [];
      const base = { file: s.file, kind: s.kind, sheet: p.summary.sheet, layers: s.layers };
      if (s.kind === 'plan' && s.placement?.type === 'horizontal')
        return [{ ...base, placement: s.placement, color: PLAN_COLORS[plans++ % PLAN_COLORS.length]! }];
      if (isVertical(s.kind) && ref) {
        const placement = placementFor(s, deriveVertical(s.file, s.kind, p.summary.sheet, ref));
        if (placement) return [{ ...base, placement, color: VERTICAL_COLORS[verticals++ % VERTICAL_COLORS.length]! }];
      }
      if (s.kind === 'site') {
        // A saved transform wins; otherwise the automatic one.
        const a = !s.transform && ref ? deriveSite(p.summary.sheet, ref) : undefined;
        const transform = s.transform ?? (a?.ok ? a.transform : undefined);
        const z = s.placement?.type === 'horizontal' ? s.placement.z : 0;
        const placement = { type: 'horizontal' as const, z, ...(transform && { transform }) };
        return [{ ...base, placement, color: SITE_COLORS[sites++ % SITE_COLORS.length]! }];
      }
      return [];
    });
  }, [sheets, parsed, ref]);
}
