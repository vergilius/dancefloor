// Existing terrain derived from the drawn sheets (PLAN.md §5 M3, ADR 0002: generated, never saved).
import { useMemo } from 'react';
import { sheetToWorld } from '../scene/coords';
import { grow, heightGrid, segmentsBox, type Box, type HeightGrid } from '../terrain/grid';
import { connectedSegments, profileSeeds, type Seeds } from '../terrain/seeds';
import { useDrawnSheets, type DrawnSheet } from './drawn';

export const PLOT_LAYER = 'PZT_ZAKRES';
/** Grid extent = plot bbox grown by this per side (m), or the seed bbox grown by SEED_MARGIN without an aligned plot. */
const PLOT_MARGIN = 1;
const SEED_MARGIN = 2.5;

export type Terrain = { seeds: Seeds; grid?: HeightGrid; extent: 'plot' | 'seeds' };

export function useTerrain(): Terrain {
  const drawn = useDrawnSheets();
  return useMemo(() => {
    const seeds = profileSeeds(
      drawn.flatMap((d) => (d.placement.type === 'vertical' ? [{ file: d.file, placement: d.placement, sheet: d.sheet }] : [])),
    );
    const plot = plotBox(drawn);
    const box = plot ? grow(plot, PLOT_MARGIN) : seedBox(seeds.points);
    const grid = box && heightGrid(seeds.points, box);
    return { seeds, grid, extent: plot ? 'plot' : 'seeds' };
  }, [drawn]);
}

/** `PZT_ZAKRES` of an aligned site sheet (one with a transform), in plan coords. Isolated lines (a legend sample) are left out. */
function plotBox(drawn: DrawnSheet[]): Box | undefined {
  for (const d of drawn) {
    if (d.kind !== 'site' || d.placement.type !== 'horizontal' || !d.placement.transform) continue;
    const s = d.sheet.layers.find((l) => l.name === PLOT_LAYER)?.segments;
    const box = s && segmentsBox(connectedSegments(s), (x, y) => sheetToWorld(d.placement, x, y));
    if (box) return box;
  }
  return undefined;
}

function seedBox(p: Float64Array): Box | undefined {
  if (p.length === 0) return undefined;
  const xy = new Float64Array((p.length / 3) * 2);
  for (let i = 0; i < p.length / 3; i++) {
    xy[2 * i] = p[3 * i]!;
    xy[2 * i + 1] = p[3 * i + 1]!;
  }
  const b = segmentsBox(xy, (x, y) => [x, y]);
  return b && grow(b, SEED_MARGIN);
}
