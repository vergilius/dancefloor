// Derived house geometry shared by the mesh and the panel (PLAN.md §5 M5): block triangles and the placed
// façade openings of every placed elevation.
import { useMemo } from 'react';
import { blockTriangles } from '../house/blocks';
import { findOpenings, openingKey, placeOpening, type OpeningRect, type PlacedOpening } from '../house/openings';
import { wallsFromPlans, WALL_LAYERS, type Walls } from '../house/walls';
import { useDrawnSheets } from './drawn';
import { useProject } from './store';

export type ElevationOpenings = {
  file: string;
  found: OpeningRect[];
  placed: (PlacedOpening & { key: string })[];
  /** Found but no house face behind them within MAX_DEPTH (roof windows, mostly). */
  missed: number;
};

/** All blocks' world triangles (x, y, z × 3 per triangle). */
export function useHouseTriangles(): Float64Array {
  const blocks = useProject((s) => s.house.blocks);
  return useMemo(() => Float64Array.from(blocks.flatMap(blockTriangles)), [blocks]);
}

export function useOpenings(): ElevationOpenings[] {
  const drawn = useDrawnSheets();
  const triangles = useHouseTriangles();
  return useMemo(() => {
    if (triangles.length === 0) return [];
    return drawn.flatMap((d) => {
      if (d.kind !== 'elevation' || d.placement.type !== 'vertical') return [];
      const e = { origin: d.placement.origin, dir: d.placement.dir };
      const found = findOpenings(d.sheet);
      const placed = found.flatMap((r) => {
        const p = placeOpening(r, e, triangles);
        return p ? [{ ...p, key: openingKey(d.file, r) }] : [];
      });
      return [{ file: d.file, found, placed, missed: found.length - placed.length }];
    });
  }, [drawn, triangles]);
}

/** Hollow house walls (M5b) from the placed plans that have wall layers. */
export function useWalls(): Walls {
  const drawn = useDrawnSheets();
  const blocks = useProject((s) => s.house.blocks);
  return useMemo(() => {
    const storeys = drawn.flatMap((d) =>
      d.kind === 'plan' && d.placement.type === 'horizontal' && d.sheet.layers.some((l) => WALL_LAYERS.includes(l.name))
        ? [{ file: d.file, z: d.placement.z, sheet: d.sheet }]
        : [],
    );
    return blocks.length && storeys.length ? wallsFromPlans(storeys, blocks) : { triangles: [], storeys: [] };
  }, [drawn, blocks]);
}
