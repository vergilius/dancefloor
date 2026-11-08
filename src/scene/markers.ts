// Level markers (PLAN.md §5 M2): resolved label points → world points + short labels. Pure.
import { levelPoint } from '../dwg/labels';
import type { LevelKind, SheetLabels } from '../dwg/types';
import { formatRel } from '../project/levels';
import { sheetToWorld, type SheetPlacement } from './coords';

export type LevelMarker = { file: string; kind: LevelKind; value: number; world: [number, number, number]; label: string };

const KIND_TEXT: Record<LevelKind, string> = { Tp: 'Tp ', Ti: 'Ti ', TpTi: 'Tp=Ti ', bare: '' };

/**
 * Site sheets: plan (x, y) through the transform, height = value − reference (the sheet's own z without one).
 * Elevations/sections: origin + x·dir, height = the circle's sheet y. Other kinds have no points.
 */
export function levelMarkers(
  sheets: { file: string; kind: string; placement: SheetPlacement; labels: SheetLabels }[],
  ref: number | undefined,
): LevelMarker[] {
  return sheets.flatMap(({ file, kind, placement, labels }) =>
    labels.levels.flatMap((l): LevelMarker[] => {
      const p = levelPoint(l, kind);
      if (!p) return [];
      const [x, y, z] = sheetToWorld(placement, p.x, p.y);
      const height = placement.type === 'horizontal' && ref !== undefined ? l.value - ref : z;
      const rel = ref === undefined ? '' : ` (${formatRel(l.value - ref)})`;
      return [{ file, kind: l.kind, value: l.value, world: [x, y, height], label: `${KIND_TEXT[l.kind]}${l.value.toFixed(2)}${rel}` }];
    }),
  );
}
