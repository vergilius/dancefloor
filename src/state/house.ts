// Derived house geometry shared by the mesh and the panel (PLAN.md §5 M5, M5b): block triangles, the placed façade
// openings of every placed elevation, and the hollow house (walls cut by the openings, fills, slabs).
import { useMemo } from 'react';
import { blockTriangles, hasRoofLayer, type GableBlock, type RoofHole } from '../house/blocks';
import { findOpenings, openingKey, placeOpening, roofHole, type OpeningRect, type PlacedOpening } from '../house/openings';
import { hollowSlabs, type Slab } from '../house/slabs';
import { hollowWalls, hostsWalls, WALL_LAYERS, type StoreyWalls } from '../house/walls';
import { t } from '../ui/strings';
import { useDrawnSheets } from './drawn';
import { useProject } from './store';

export type ElevationOpenings = {
  file: string;
  found: OpeningRect[];
  /** `hole`: cut through the hollow shell or the roof (M5b); otherwise drawn as a dark quad. */
  placed: (PlacedOpening & { key: string; hole: boolean })[];
  /** Found but no house face behind them within MAX_DEPTH (roof windows, mostly); hidden ones not counted. */
  missed: number;
  /** Keys of `found` (same order) and how many of them are hidden (T4). */
  keys: string[];
  hidden: number;
};

export type House3D = {
  openings: ElevationOpenings[];
  /** Hollow house (M5b); empty without wall lines on the plans. */
  walls: number[];
  slabs: number[];
  /** Roof windows (and the eave windows' upper part) cut out of the roof planes. */
  roofHoles: RoofHole[];
  /** Exterior wall thickness (m), and whether it was measured on the plan. */
  thickness: number;
  thicknessFound: boolean;
  slabList: Slab[];
  storeys: StoreyWalls[];
  /** The ground storey's z: blocks hosting its walls are drawn hollow. */
  groundZ: number;
};

const EMPTY: House3D = { openings: [], walls: [], slabs: [], roofHoles: [], thickness: 0, thicknessFound: false, slabList: [], storeys: [], groundZ: 0 };

export function useHouse3D(): House3D {
  const drawn = useDrawnSheets();
  const blocks = useProject((s) => s.house.blocks);
  const cut = useProject((s) => s.showOpenings);
  const hidden = useProject((s) => s.house.hiddenOpenings);
  return useMemo(() => shared(drawn, blocks, cut, hidden), [drawn, blocks, cut, hidden]);
}

type Blocks = ReturnType<typeof useProject.getState>['house']['blocks'];
let last: { drawn: ReturnType<typeof useDrawnSheets>; blocks: Blocks; cut: boolean; hidden: string[]; out: House3D } | undefined;

/** One result for the mesh and the panel (the walls are built twice per change: uncut, then cut). */
function shared(drawn: ReturnType<typeof useDrawnSheets>, blocks: Blocks, cut: boolean, hidden: string[]): House3D {
  if (last?.drawn !== drawn || last.blocks !== blocks || last.cut !== cut || last.hidden !== hidden)
    last = { drawn, blocks, cut, hidden, out: build(drawn, blocks, cut, hidden) };
  return last.out;
}

/** `cut` false ("Otwory" off): closed walls and roof, no dark quads; the openings are still found and counted.
 *  Hidden openings (T4) are listed but neither cut, drawn nor turned into roof holes. */
function build(drawn: ReturnType<typeof useDrawnSheets>, blocks: Blocks, cut: boolean, hidden: string[]): House3D {
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
      // The roof plan (PAB-03) draws walls too, but it is no storey: the attic's walls end under the roof planes.
      d.kind === 'plan' && d.placement.type === 'horizontal' && !hasRoofLayer(d.sheet) && d.sheet.layers.some((l) => WALL_LAYERS.includes(l.name))
        ? [{ file: d.file, z: d.placement.z, sheet: d.sheet }]
        : [],
    );
    const zs = storeys.map((s) => s.z).sort((a, b) => a - b);
    const groundZ = zs[0] ?? 0;
    // Openings on the solid blocks first; with walls from the plans they become cuts + fills.
    const placed = elevations.map(({ file, sheet, e }) => {
      const found = findOpenings(sheet);
      const keys = found.map((r) => openingKey(file, r));
      const visible = found.filter((_, i) => !hidden.includes(keys[i]!));
      const on = visible.flatMap((r) => {
        const p = placeOpening(r, e, triangles);
        return p ? [{ ...p, key: openingKey(file, r), e }] : [];
      });
      return { file, found, keys, visible, on };
    });
    const all = placed.flatMap((p) => p.on);
    const walls = storeys.length ? hollowWalls(storeys, blocks, cut ? all : []) : undefined;
    const main = blocks.find((b): b is GableBlock => b.kind === 'gable');
    // Roof windows: every opening found on an elevation looking at a slope, placed or not.
    const roofHoles = cut && main && walls ? placed.flatMap(({ visible }, i) => visible.flatMap((r) => roofHole(main, r, elevations[i]!.e) ?? [])) : [];
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
    const openings = placed.map(({ file, found, keys, visible, on }) => ({
      file,
      found,
      keys,
      hidden: found.length - visible.length,
      // A hole in the shell, or (above the wall face, on a slope seen face-on) in the roof.
      placed: on.map((o) => ({ ...o, hole: (walls?.hole[k++] ?? false) || (!!main && !!walls && roofHole(main, o.rect, o.e) !== undefined) })),
      missed: visible.length - on.length,
    }));
    return {
      openings,
      walls: walls?.triangles ?? [],
      slabs: slabs?.triangles ?? [],
      roofHoles,
      thickness: walls?.thickness ?? 0,
      thicknessFound: walls?.thicknessFound ?? false,
      slabList: slabs?.slabs ?? [],
      storeys: walls?.storeys ?? [],
      groundZ,
    };
  }
}
