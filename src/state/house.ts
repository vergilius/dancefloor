// Derived house geometry shared by the mesh and the panel (PLAN.md §5 M5, M5b): block triangles, the placed façade
// openings of every placed elevation, and the hollow house (walls cut by the openings, fills, slabs).
import { useMemo } from 'react';
import { blockTriangles, type GableBlock } from '../house/blocks';
import { findOpenings, openingKey, placeOpening, type OpeningRect, type PlacedOpening } from '../house/openings';
import { hollowSlabs, openingFills, type Slab } from '../house/slabs';
import { hostsWalls, wallsFromPlans, WALL_LAYERS, type StoreyWalls } from '../house/walls';
import { t } from '../ui/strings';
import { useDrawnSheets } from './drawn';
import { useProject } from './store';

export type ElevationOpenings = {
  file: string;
  found: OpeningRect[];
  /** `hole`: cut through a hollow wall (M5b); otherwise drawn as a dark quad. */
  placed: (PlacedOpening & { key: string; hole: boolean })[];
  /** Found but no house face behind them within MAX_DEPTH (roof windows, mostly). */
  missed: number;
};

export type House3D = {
  openings: ElevationOpenings[];
  /** Hollow house (M5b); empty without wall lines on the plans. */
  walls: number[];
  fills: number[];
  slabs: number[];
  slabList: Slab[];
  storeys: StoreyWalls[];
  /** The ground storey's z: blocks hosting its walls are drawn hollow. */
  groundZ: number;
};

const EMPTY: House3D = { openings: [], walls: [], fills: [], slabs: [], slabList: [], storeys: [], groundZ: 0 };

export function useHouse3D(): House3D {
  const drawn = useDrawnSheets();
  const blocks = useProject((s) => s.house.blocks);
  return useMemo(() => shared(drawn, blocks), [drawn, blocks]);
}

type Blocks = ReturnType<typeof useProject.getState>['house']['blocks'];
let last: { drawn: ReturnType<typeof useDrawnSheets>; blocks: Blocks; out: House3D } | undefined;

/** One result for the mesh and the panel (the walls are built twice per change: uncut, then cut). */
function shared(drawn: ReturnType<typeof useDrawnSheets>, blocks: Blocks): House3D {
  if (last?.drawn !== drawn || last.blocks !== blocks) last = { drawn, blocks, out: build(drawn, blocks) };
  return last.out;
}

function build(drawn: ReturnType<typeof useDrawnSheets>, blocks: Blocks): House3D {
  {
    if (blocks.length === 0) return EMPTY;
    const triangles = Float64Array.from(blocks.flatMap(blockTriangles));
    const elevations = drawn.flatMap((d) =>
      d.kind === 'elevation' && d.placement.type === 'vertical' ? [{ file: d.file, sheet: d.sheet, e: { origin: d.placement.origin, dir: d.placement.dir } }] : [],
    );
    const sections = drawn.flatMap((d) =>
      d.kind === 'section' && d.placement.type === 'vertical' ? [{ file: d.file, sheet: d.sheet, origin: d.placement.origin, dir: d.placement.dir }] : [],
    );
    const storeys = drawn.flatMap((d) =>
      d.kind === 'plan' && d.placement.type === 'horizontal' && d.sheet.layers.some((l) => WALL_LAYERS.includes(l.name))
        ? [{ file: d.file, z: d.placement.z, sheet: d.sheet }]
        : [],
    );
    const zs = storeys.map((s) => s.z).sort((a, b) => a - b);
    const groundZ = zs[0] ?? 0;
    // Openings on the solid blocks first; with walls from the plans they become cuts + fills.
    const placed = elevations.map(({ file, sheet, e }) => {
      const found = findOpenings(sheet);
      const on = found.flatMap((r) => {
        const p = placeOpening(r, e, triangles);
        return p ? [{ ...p, key: openingKey(file, r), e }] : [];
      });
      return { file, found, on };
    });
    const uncut = storeys.length ? wallsFromPlans(storeys, blocks) : undefined;
    const all = placed.flatMap((p) => p.on);
    const fills = uncut ? openingFills(all, Float64Array.from(uncut.triangles), blocks, zs) : undefined;
    const walls = uncut && fills ? wallsFromPlans(storeys, blocks, fills.cuts) : undefined;
    const main = blocks.find((b): b is GableBlock => b.kind === 'gable');
    const slabs = walls
      ? hollowSlabs(
          main,
          blocks.filter((b) => b.kind === 'flat' && hostsWalls(b, groundZ)) as Parameters<typeof hollowSlabs>[1],
          zs,
          sections,
          { ground: t.house.slabGround, ceiling: t.house.slabCeiling, recess: t.house.slabRecess },
          (b) => blockTriangles(b),
        )
      : undefined;
    let k = 0;
    const openings = placed.map(({ file, found, on }) => ({
      file,
      found,
      placed: on.map((o) => ({ ...o, hole: fills?.hole[k++] ?? false })),
      missed: found.length - on.length,
    }));
    return {
      openings,
      walls: walls?.triangles ?? [],
      fills: fills?.triangles ?? [],
      slabs: slabs?.triangles ?? [],
      slabList: slabs?.slabs ?? [],
      storeys: walls?.storeys ?? [],
      groundZ,
    };
  }
}
