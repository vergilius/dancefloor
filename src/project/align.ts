// Sheet → reference plan similarity transforms (PLAN.md §4 `Similarity2D`, §5 M1c). Pure.
import type { NormalizedSheet } from '../dwg/types';

export type Vec2 = { x: number; y: number };
/** p′ = scale · R(rotation) · p + translate. Rotation in radians (CCW). */
export type Similarity2D = { scale: number; rotation: number; translate: Vec2 };

export const IDENTITY: Similarity2D = { scale: 1, rotation: 0, translate: { x: 0, y: 0 } };

export function apply(t: Similarity2D, p: Vec2): Vec2 {
  const c = t.scale * Math.cos(t.rotation);
  const s = t.scale * Math.sin(t.rotation);
  return { x: c * p.x - s * p.y + t.translate.x, y: s * p.x + c * p.y + t.translate.y };
}

export function invert(t: Similarity2D): Similarity2D {
  const inv = { scale: 1 / t.scale, rotation: -t.rotation, translate: { x: 0, y: 0 } };
  const p = apply(inv, t.translate);
  return { ...inv, translate: { x: -p.x, y: -p.y } };
}

/** The transform taking a → a2 and b → b2. Undefined if a and b coincide. */
export function fromTwoPairs(a: Vec2, a2: Vec2, b: Vec2, b2: Vec2): Similarity2D | undefined {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return undefined;
  const scale = Math.hypot(b2.x - a2.x, b2.y - a2.y) / len;
  const rotation = Math.atan2(b2.y - a2.y, b2.x - a2.x) - Math.atan2(vy, vx);
  const p = apply({ scale, rotation, translate: { x: 0, y: 0 } }, a);
  return { scale, rotation: wrap(rotation), translate: { x: a2.x - p.x, y: a2.y - p.y } };
}

/** Angle into (−π, π]. */
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));

export const WALL_LAYER = 'A-WALL';
const MIN_DIR_LEN = 0.5;
const MATCH_TOL = 0.02;
export const MIN_SHARE = 0.5;
/** Reference endpoints that vote: an even sample keeps voting at ~200 × site endpoints per candidate. */
const VOTERS = 200;

export type AutoAlign =
  | { ok: true; transform: Similarity2D; share: number; matched: number; total: number }
  | { ok: false; reason: 'noSiteWalls' | 'noRefWalls' | 'lowShare'; share?: number };

const wallSegments = (sheet: NormalizedSheet) => sheet.layers.find((l) => l.name === WALL_LAYER)?.segments;

/** Length-weighted dominant direction mod 90° (angle × 4 averaging), radians. */
function dominant(segs: Float64Array): number | undefined {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const dx = segs[i + 2]! - segs[i]!;
    const dy = segs[i + 3]! - segs[i + 1]!;
    const len = Math.hypot(dx, dy);
    if (len < MIN_DIR_LEN) continue;
    const a = 4 * Math.atan2(dy, dx);
    sx += len * Math.cos(a);
    sy += len * Math.sin(a);
  }
  return sx === 0 && sy === 0 ? undefined : Math.atan2(sy, sx) / 4;
}

/** Unique segment endpoints (to 1 mm). */
function endpoints(segs: Float64Array): Vec2[] {
  const seen = new Set<number>();
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < segs.length; i += 2) {
    const x = segs[i]!;
    const y = segs[i + 1]!;
    const key = Math.round(x * 1000) * 1e7 + Math.round(y * 1000);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y });
  }
  return out;
}

/** Share of `ref` points that have a `pts` point within MATCH_TOL (grid hash, cell = tolerance). */
function matchCount(ref: Vec2[], pts: Vec2[]): number {
  const cell = (v: number) => Math.floor(v / MATCH_TOL);
  const grid = new Map<number, Vec2[]>();
  for (const p of pts) {
    const k = cell(p.x) * 1e7 + cell(p.y);
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  let n = 0;
  for (const r of ref) {
    const cx = cell(r.x);
    const cy = cell(r.y);
    let hit = false;
    for (let i = -1; i <= 1 && !hit; i++)
      for (let j = -1; j <= 1 && !hit; j++)
        for (const p of grid.get((cx + i) * 1e7 + cy + j) ?? [])
          if (Math.hypot(p.x - r.x, p.y - r.y) <= MATCH_TOL) {
            hit = true;
            break;
          }
    if (hit) n++;
  }
  return n;
}

/**
 * Site sheet → reference plan from both sheets' A-WALL, scale 1 (PLAN.md §5 M1c): rotation from the dominant wall
 * directions (+ k·90°), translation by 1 mm endpoint-difference voting, best share of matched reference endpoints wins.
 */
export function autoAlign(site: NormalizedSheet, ref: NormalizedSheet): AutoAlign {
  const sSegs = wallSegments(site);
  const rSegs = wallSegments(ref);
  const sDir = sSegs && dominant(sSegs);
  const rDir = rSegs && dominant(rSegs);
  if (sDir === undefined || !sSegs) return { ok: false, reason: 'noSiteWalls' };
  if (rDir === undefined || !rSegs) return { ok: false, reason: 'noRefWalls' };
  const sPts = endpoints(sSegs);
  const rPts = endpoints(rSegs);
  const step = Math.ceil(rPts.length / VOTERS);
  const voters = rPts.filter((_, i) => i % step === 0);
  let best: { transform: Similarity2D; matched: number } | undefined;
  for (let k = 0; k < 4; k++) {
    const rotation = wrap(rDir - sDir + (k * Math.PI) / 2);
    const rot = { scale: 1, rotation, translate: { x: 0, y: 0 } };
    const moved = sPts.map((p) => apply(rot, p));
    const votes = new Map<number, number>();
    let top = 0;
    let topKey = 0;
    for (const r of voters)
      for (const p of moved) {
        const key = Math.round((r.x - p.x) * 1000) * 1e7 + Math.round((r.y - p.y) * 1000);
        const v = (votes.get(key) ?? 0) + 1;
        votes.set(key, v);
        if (v > top) [top, topKey] = [v, key];
      }
    const ix = Math.round(topKey / 1e7);
    const translate = { x: ix / 1000, y: (topKey - ix * 1e7) / 1000 };
    const transform = { scale: 1, rotation, translate };
    const matched = matchCount(rPts, sPts.map((p) => apply(transform, p)));
    if (!best || matched > best.matched) best = { transform, matched };
  }
  const share = best!.matched / rPts.length;
  if (share < MIN_SHARE) return { ok: false, reason: 'lowShare', share };
  return { ok: true, transform: best!.transform, share, matched: best!.matched, total: rPts.length };
}
