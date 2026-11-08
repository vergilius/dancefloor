// Hollow house slabs and opening fills (PLAN.md §5 M5b, ADR 0006). Pure.
// Slabs: levels read from the placed sections over each block (`A-FLOR-2` = structure faces, `A-FLOR-1` = finished
// floors). Fills: a façade opening that lands on a gap in the plan walls gets a sill and a head fill through the wall.
import type { NormalizedSheet } from '../dwg/types';
import { rectMinus, roofHeight, wallFace, type Block, type FlatBlock, type GableBlock, type Vec2 } from './blocks';
import { pointInPolygon } from './fromPlan';
import { rayHits, type Elevation, type OpeningRect } from './openings';
import { hostsWalls, type WallCut } from './walls';

export type SectionIn = { file: string; sheet: NormalizedSheet; origin: Vec2; dir: Vec2 };
export type Slab = { name: string; bottom: number; top: number; from: string };

const STRUCTURE = 'A-FLOR-2';
const FINISH = 'A-FLOR-1';
/** A section line counts for a block if at least this much of it (m) lies over the block. */
const MIN_OVER = 1;
/** Slab lines are looked for this far (m) below the level they carry. */
const SLAB_ZONE = 1;

/** Heights of a section's horizontal lines on `layer` that run ≥ MIN_OVER over the polygon. */
function levels(sec: SectionIn, layer: string, poly: Vec2[]): number[] {
  const s = sec.sheet.layers.find((l) => l.name === layer)?.segments;
  const out = new Set<number>();
  if (!s) return [];
  for (let i = 0; i < s.length; i += 4) {
    if (Math.abs(s[i + 1]! - s[i + 3]!) > 0.002) continue;
    const a = Math.min(s[i]!, s[i + 2]!);
    const b = Math.max(s[i]!, s[i + 2]!);
    let over = 0;
    const step = 0.05;
    for (let x = a + step / 2; x < b; x += step)
      if (pointInPolygon({ x: sec.origin.x + x * sec.dir.x, y: sec.origin.y + x * sec.dir.y }, poly)) over += step;
    if (over >= MIN_OVER) out.add(Math.round(s[i + 1]! * 1000) / 1000);
  }
  return [...out].sort((p, q) => p - q);
}

/** First section giving a value: `pick` from its lines on `layer` within [lo, hi). */
function fromSections(sections: SectionIn[], layer: string, poly: Vec2[], lo: number, hi: number, pick: (v: number[]) => number) {
  for (const sec of sections) {
    const v = levels(sec, layer, poly).filter((h) => h >= lo && h < hi);
    if (v.length) return { value: pick(v), file: sec.file };
  }
  return undefined;
}

const rectRing = (r: { x0: number; y0: number; x1: number; y1: number }): Vec2[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
];

/** Prism over a plan ring with one bottom and per-corner tops (sloped under a roof). Convex rings only (fan). */
function prism(out: number[], ring: Vec2[], bottom: number, tops: number[]) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const ta = tops[i]!;
    const tb = tops[(i + 1) % n]!;
    out.push(a.x, a.y, bottom, b.x, b.y, bottom, b.x, b.y, tb, a.x, a.y, bottom, b.x, b.y, tb, a.x, a.y, ta);
  }
  for (let i = 1; i + 1 < n; i++) {
    const [a, b, c] = [ring[0]!, ring[i]!, ring[i + 1]!];
    out.push(a.x, a.y, tops[0]!, b.x, b.y, tops[i]!, c.x, c.y, tops[i + 1]!);
    out.push(a.x, a.y, bottom, c.x, c.y, bottom, b.x, b.y, bottom);
  }
}

/** Flat slab over a ring with holes (via the block triangulation). */
function slabTriangles(out: number[], polygon: Vec2[], holes: Vec2[][], bottom: number, top: number, tri: (b: FlatBlock) => number[]) {
  out.push(...tri({ kind: 'flat', name: '', polygon, holes, bottom, top }));
}

/**
 * Slabs of the hollow main body and annexes: a ground slab under each (finished floor ← section, down to the
 * lowest structure line within 1 m), a slab under every upper storey of the main body, and the annex roof (its
 * ceiling ← section, up to its top). Recesses: the ground slab leaves them out, and their soffit is filled up to
 * the next storey.
 */
export function hollowSlabs(
  main: GableBlock | undefined,
  hosts: FlatBlock[],
  storeyZ: number[],
  sections: SectionIn[],
  names: { ground: (block: string) => string; ceiling: (block: string, z: number) => string; recess: string },
  tri: (b: FlatBlock) => number[],
): { triangles: number[]; slabs: Slab[] } {
  const out: number[] = [];
  const slabs: Slab[] = [];
  const zs = [...storeyZ].sort((a, b) => a - b);
  const z0 = zs[0] ?? 0;
  const ground = (name: string, poly: Vec2[], holes: Vec2[][]) => {
    const top = fromSections(sections, FINISH, poly, z0 - 0.5, z0 + 0.5, (v) => v.reduce((p, q) => (Math.abs(q - z0) < Math.abs(p - z0) ? q : p)));
    const t = top?.value ?? z0;
    const bot = fromSections(sections, STRUCTURE, poly, t - SLAB_ZONE, t, (v) => v[0]!);
    if (!bot) return;
    slabTriangles(out, poly, holes, bot.value, t, tri);
    slabs.push({ name: names.ground(name), bottom: bot.value, top: t, from: bot.file });
  };
  if (main) {
    const ring = rectRing(main);
    const [outer, ...holes] = rectMinus(main, main.recesses ?? []);
    if (outer) ground(main.name, outer, holes);
    for (const z of zs.slice(1)) {
      const bot = fromSections(sections, STRUCTURE, ring, z - SLAB_ZONE, z, (v) => v[0]!);
      if (!bot) continue;
      slabTriangles(out, ring, [], bot.value, z, tri);
      slabs.push({ name: names.ceiling(main.name, z), bottom: bot.value, top: z, from: bot.file });
    }
    // Recess soffits: from the soffit up to the next storey (or the wall face), the band the walls leave open.
    const up = zs[1] ?? wallFace(main);
    for (const r of main.recesses ?? []) {
      if (r.top >= up) continue;
      prism(out, rectRing(r), r.top, [up, up, up, up]);
      slabs.push({ name: names.recess, bottom: r.top, top: up, from: main.name });
    }
  }
  for (const h of hosts) {
    ground(h.name, h.polygon, h.holes ?? []);
    const bot = fromSections(sections, STRUCTURE, h.polygon, h.top - SLAB_ZONE, h.top, (v) => v[0]!);
    if (!bot) continue;
    slabTriangles(out, h.polygon, h.holes ?? [], bot.value, h.top, tri);
    slabs.push({ name: names.ceiling(h.name, h.top), bottom: bot.value, top: h.top, from: bot.file });
  }
  return { triangles: out, slabs };
}

export type FillIn = { rect: OpeningRect; e: Elevation; depth: number };

/** Wall faces within this distance (m) behind the outer face belong to the same wall. */
const WALL_MAX = 0.8;
const SIDE = 0.05;
const SIDE_STEPS = [SIDE, 0.15, 0.3, 0.6, 1];
/** The wall face beside an opening lies this close (m) to where it was placed (eave windows: 0.17 behind the roof). */
const AT_FACE = 0.25;

/**
 * For each placed opening: `hole` if there is a plan wall at it (faces beside it within WALL_MAX). Then it becomes a
 * cut through the walls (sill to head, the opening's width × the wall's thickness, measured beside it) plus a sill
 * fill (wall bottom → sill) and a head fill (head → storey top, under the roof on the top storey) where the plan
 * leaves a gap. Openings with no wall at them (on the roof: the eave windows) stay dark quads.
 */
export function openingFills(
  openings: FillIn[],
  wallTriangles: ArrayLike<number>,
  blocks: Block[],
  storeyZ: number[],
): { triangles: number[]; hole: boolean[]; cuts: WallCut[] } {
  const out: number[] = [];
  const zs = [...storeyZ].sort((a, b) => a - b);
  const main = blocks.find((b): b is GableBlock => b.kind === 'gable');
  const cuts: WallCut[] = [];
  const hole = openings.map(({ rect: r, e, depth }) => {
    const v = { x: -e.dir.y, y: e.dir.x };
    const at = (x: number, d: number): Vec2 => ({ x: e.origin.x + x * e.dir.x + d * v.x, y: e.origin.y + x * e.dir.y + d * v.y });
    const ray = (x: number, z: number) => {
      const p = at(x, depth - 0.3);
      return rayHits([p.x, p.y, z], [v.x, v.y, 0], wallTriangles).map((t) => t - 0.3);
    };
    const cz = (r.y0 + r.y1) / 2;
    // Wall thickness beside the opening: the faces within WALL_MAX behind the first.
    const thick = Math.max(
      0,
      ...[-1, 1].map((side) => {
        // Beside the opening, stepping outwards: windows in a row share one plan gap (the attic gable on PAB-09).
        for (const off of SIDE_STEPS) {
          const h = ray(side < 0 ? r.x0 - off : r.x1 + off, cz);
          // The wall must stand where the opening was placed (not deeper: a roof window lands on the roof plane).
          if (h.length && Math.abs(h[0]!) <= AT_FACE) return Math.max(...h.filter((t) => t - h[0]! <= WALL_MAX)) - h[0]!;
        }
        return 0;
      }),
    );
    if (thick <= 0) return false;
    cuts.push({ origin: e.origin, dir: e.dir, x0: r.x0, x1: r.x1, d0: depth - SIDE, d1: depth + thick + SIDE, y0: r.y0, y1: r.y1 });
    const plan = [at(r.x0, depth), at(r.x1, depth), at(r.x1, depth + thick), at(r.x0, depth + thick)];
    const mid = { x: (plan[0]!.x + plan[2]!.x) / 2, y: (plan[0]!.y + plan[2]!.y) / 2 };
    const host = blocks.find((b): b is FlatBlock => hostsWalls(b, zs[0] ?? 0) && pointInPolygon(mid, b.polygon));
    // The storey the opening is in, the wall's bottom and the top above the head.
    const k = Math.max(0, zs.findLastIndex((z) => z <= r.y0 + 0.05));
    const z = zs[k] ?? 0;
    const inMain = main && mid.x > main.x0 - 0.1 && mid.x < main.x1 + 0.1 && mid.y > main.y0 - 0.1 && mid.y < main.y1 + 0.1;
    const bottom = k === 0 ? (inMain ? main.bottom : host?.bottom ?? z) : z;
    const tops = plan.map((p) =>
      !inMain && host ? host.top : zs[k + 1] ?? (main ? roofHeight(main, p.x, p.y) : z),
    );
    if (r.y0 > bottom + 0.01) prism(out, plan, bottom, [r.y0, r.y0, r.y0, r.y0]);
    // Head fill: from the head up to the storey top (per corner: sloped under the roof).
    if (tops.every((t) => t > r.y1 + 0.01)) prism(out, plan, r.y1, tops);
    return true;
  });
  return { triangles: out, hole, cuts };
}
