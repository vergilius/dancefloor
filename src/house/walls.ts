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

/** Flat blocks whose walls come from storey `z`'s plan (the annex): standing on the ground there, ≥ 2 m tall, > 4 m². */
export const hostsWalls = (b: Block, z: number): b is FlatBlock =>
  b.kind === 'flat' && b.bottom <= z + 0.5 && b.top >= z + HOST_MIN_HEIGHT && polygonArea(b.polygon) > 4;

export function wallsFromPlans(storeys: Storey[], blocks: Block[]): Walls {
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
        if (main && nearRect(mid, main)) {
          const bottom = exterior && k === 0 ? main.bottom : st.z;
          if (next !== undefined) face(triangles, a, b, bottom, bottom, next, next);
          else {
            // Top storey: up to the roof planes, split where the line crosses the ridge.
            const r = ridgeLine(main);
            const ca = r.alongX ? a.y - r.at : a.x - r.at;
            const cb = r.alongX ? b.y - r.at : b.x - r.at;
            const h = (p: Vec2) => roofHeight(main, p.x, p.y);
            if (ca * cb < 0) {
              const t = ca / (ca - cb);
              const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
              face(triangles, a, m, bottom, bottom, h(a), h(m));
              face(triangles, m, b, bottom, bottom, h(m), h(b));
            } else face(triangles, a, b, bottom, bottom, h(a), h(b));
          }
        } else {
          const host = hosts.find((hb) => nearPolygon(mid, hb.polygon));
          if (!host) {
            skipped++;
            continue;
          }
          const bottom = exterior && k === 0 ? host.bottom : st.z;
          face(triangles, a, b, bottom, bottom, host.top, host.top);
        }
        faces++;
        length += len;
      }
    }
    out.push({ file: st.file, z: st.z, faces, length, skipped });
  });
  return { triangles, storeys: out };
}
