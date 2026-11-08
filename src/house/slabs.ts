// Hollow house slabs (PLAN.md §5 M5b, ADR 0006). Pure. Levels read from the placed sections over each block
// (`A-FLOR-2` = structure faces, `A-FLOR-1` = finished floors).
import type { NormalizedSheet } from '../dwg/types';
import { rectMinus, wallFace, type FlatBlock, type GableBlock, type Vec2 } from './blocks';
import { pointInPolygon } from './fromPlan';

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
