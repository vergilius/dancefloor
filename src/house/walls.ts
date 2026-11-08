// Hollow house walls from the plans' wall lines (PLAN.md §5 M5b, ADR 0006). Pure.
// Each wall line of a storey becomes a vertical, double-sided face: from the storey's z to the next storey's z;
// on the top storey up to the gable roof (split at the ridge, so the top follows both planes). Exterior lines
// (`I-WALL`) on the ground storey start at the block bottom so they meet the terrain. Lines in the annex run from
// the storey z to the annex top. Lines in no house block (posts, steps, the deck) are skipped.
import type { NormalizedSheet } from '../dwg/types';
import { polygonArea, ridgeLine, roofHeight, type Block, type FlatBlock, type GableBlock, type Vec2 } from './blocks';
import { pointInPolygon } from './fromPlan';

export const WALL_LAYERS = ['I-WALL', 'I-WALL-1', 'A-WALL', 'A-WALL-1'];
const EXTERIOR_LAYER = 'I-WALL';
/** Shorter lines (m) are dropped (hatch ends, tiny jogs). */
const MIN_LEN = 0.02;
/** Lines this close (m) to a block's outline count as in it (exterior faces sit on it, 1 cm either side). */
const EDGE_TOL = 0.05;
/** A flat block hosts walls of a storey if it stands on the ground there and is at least this tall above it (m). */
const HOST_MIN_HEIGHT = 2;

export type Storey = { file: string; z: number; sheet: NormalizedSheet };

export type StoreyWalls = {
  file: string;
  z: number;
  /** Lines drawn as faces, and their total length (m). */
  faces: number;
  length: number;
  /** Lines in no house block (posts, steps, deck edges) or too short. */
  skipped: number;
};

export type Walls = { triangles: number[]; storeys: StoreyWalls[] };

const nearRect = (p: Vec2, b: GableBlock) => p.x > b.x0 - EDGE_TOL && p.x < b.x1 + EDGE_TOL && p.y > b.y0 - EDGE_TOL && p.y < b.y1 + EDGE_TOL;

/** Inside the polygon or within EDGE_TOL of it (checked at the point and 4 nudged points). */
function nearPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (pointInPolygon(p, poly)) return true;
  return [
    [EDGE_TOL, 0],
    [-EDGE_TOL, 0],
    [0, EDGE_TOL],
    [0, -EDGE_TOL],
  ].some(([dx, dy]) => pointInPolygon({ x: p.x + dx!, y: p.y + dy! }, poly));
}

/** Vertical quad between plan points a, b from bottom heights (za, zb) to top heights (ta, tb). */
function face(out: number[], a: Vec2, b: Vec2, za: number, zb: number, ta: number, tb: number) {
  out.push(a.x, a.y, za, b.x, b.y, zb, b.x, b.y, tb, a.x, a.y, za, b.x, b.y, tb, a.x, a.y, ta);
}

/**
 * An opening cut through the walls (M5b T6): within x0…x1 along its elevation's `dir` and depth d0…d1 along the view
 * direction, wall lines parallel to the façade keep only their parts below `y0` (sill) and above `y1` (head). The
 * plans draw lines across some openings (the wall above the garage door), so cutting beats relying on plan gaps.
 */
export type WallCut = { origin: Vec2; dir: Vec2; x0: number; x1: number; d0: number; d1: number; y0: number; y1: number };

const CUT_TOL = 0.03;

/** Splits a line by the cuts it lies in: pieces with the cut's sill/head, or none (full height). */
function pieces(a: Vec2, b: Vec2, cuts: WallCut[]): { a: Vec2; b: Vec2; cut?: WallCut }[] {
  for (const c of cuts) {
    const v = { x: -c.dir.y, y: c.dir.x };
    const sx = (p: Vec2) => (p.x - c.origin.x) * c.dir.x + (p.y - c.origin.y) * c.dir.y;
    const sd = (p: Vec2) => (p.x - c.origin.x) * v.x + (p.y - c.origin.y) * v.y;
    const [xa, xb, da, db] = [sx(a), sx(b), sd(a), sd(b)];
    if (Math.abs(xa - xb) < 1e-3) continue; // across the wall: a jamb, kept
    if ([da, db].some((d) => d < c.d0 - CUT_TOL || d > c.d1 + CUT_TOL)) continue;
    const lo = Math.max(Math.min(xa, xb), c.x0);
    const hi = Math.min(Math.max(xa, xb), c.x1);
    if (hi - lo < 1e-3) continue;
    const at = (x: number): Vec2 => {
      const t = (x - xa) / (xb - xa);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };
    const [p, q] = xa < xb ? [lo, hi] : [hi, lo];
    const rest = cuts.filter((o) => o !== c);
    return [
      ...(Math.abs(xa - p) > 1e-3 ? pieces(a, at(p), rest) : []),
      { a: at(p), b: at(q), cut: c },
      ...(Math.abs(q - xb) > 1e-3 ? pieces(at(q), b, rest) : []),
    ];
  }
  return [{ a, b }];
}

/** Flat blocks whose walls come from storey `z`'s plan (the annex): standing on the ground there, ≥ 2 m tall, > 4 m². */
export const hostsWalls = (b: Block, z: number): b is FlatBlock =>
  b.kind === 'flat' && b.bottom <= z + 0.5 && b.top >= z + HOST_MIN_HEIGHT && polygonArea(b.polygon) > 4;

export function wallsFromPlans(storeys: Storey[], blocks: Block[], cuts: WallCut[] = []): Walls {
  const main = blocks.find((b): b is GableBlock => b.kind === 'gable');
  const sorted = [...storeys].sort((a, b) => a.z - b.z);
  const triangles: number[] = [];
  const out: StoreyWalls[] = [];
  sorted.forEach((st, k) => {
    const next = sorted[k + 1]?.z;
    const hosts = blocks.filter((b) => hostsWalls(b, st.z));
    let faces = 0;
    let length = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const l of st.sheet.layers) {
      if (!WALL_LAYERS.includes(l.name)) continue;
      const exterior = l.name === EXTERIOR_LAYER;
      const s = l.segments;
      for (let i = 0; i < s.length; i += 4) {
        const a = { x: s[i]!, y: s[i + 1]! };
        const b = { x: s[i + 2]!, y: s[i + 3]! };
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        // The same line on two layers is drawn once.
        const key = [a, b]
          .map((p) => `${Math.round(p.x * 500)},${Math.round(p.y * 500)}`)
          .sort()
          .join('|');
        if (len < MIN_LEN || seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Bottom and top of this line's wall: main body (next storey, or the roof on the top storey) or annex.
        let bottom: number;
        let top: (p: Vec2) => number;
        if (main && nearRect(mid, main)) {
          bottom = exterior && k === 0 ? main.bottom : st.z;
          // Never above the roof planes, whatever the next storey says.
          top = next !== undefined ? (p) => Math.min(next, roofHeight(main, p.x, p.y)) : (p) => roofHeight(main, p.x, p.y);
        } else {
          const host = hosts.find((hb) => nearPolygon(mid, hb.polygon));
          if (!host) {
            skipped++;
            continue;
          }
          bottom = exterior && k === 0 ? host.bottom : st.z;
          top = () => host.top;
        }
        // Up to `top` from `lo` (a constant, or another height function), split at the ridge so the top follows both
        // roof planes.
        const emit = (p: Vec2, q: Vec2, lo: number, hi: (p: Vec2) => number) => {
          if (hi(p) <= lo && hi(q) <= lo) return; // starts above its top (e.g. a plan placed above the roof)
          const r = main ? ridgeLine(main) : undefined;
          const cp = r ? (r.alongX ? p.y : p.x) - r.at : 0;
          const cq = r ? (r.alongX ? q.y : q.x) - r.at : 0;
          if (cp * cq < 0) {
            const t = cp / (cp - cq);
            const m = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
            face(triangles, p, m, lo, lo, hi(p), hi(m));
            face(triangles, m, q, lo, lo, hi(m), hi(q));
          } else face(triangles, p, q, lo, lo, hi(p), hi(q));
        };
        for (const pc of pieces(a, b, cuts)) {
          if (!pc.cut) emit(pc.a, pc.b, bottom, top);
          else {
            const { y0, y1 } = pc.cut;
            if (y0 > bottom + 1e-3) emit(pc.a, pc.b, bottom, () => y0);
            if (top(pc.a) > y1 + 1e-3 && top(pc.b) > y1 + 1e-3) emit(pc.a, pc.b, y1, top);
          }
        }
        faces++;
        length += len;
      }
    }
    out.push({ file: st.file, z: st.z, faces, length, skipped });
  });
  return { triangles, storeys: out };
}
