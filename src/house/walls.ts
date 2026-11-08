// Hollow house walls (PLAN.md §5 M5b, ADR 0006 as amended 2026-11-08: "najprostsza bryła"). Pure.
// - Exterior: one solid shell along each hollow block's outline (the main body with its recesses, the annex), as
//   thick as the plans' exterior walls (`I-WALL` face distance), from the block bottom to its top (main body: up to
//   the roof planes, so the gables reach the ridge). The façade openings are cut out of it: only the wall below the
//   sill and above the head is left there.
// - Partitions: per storey, pairs of parallel wall lines 5–35 cm apart inside the shell become solid walls from the
//   storey floor to the next storey (top storey: the roof). Single lines and the layer lines inside the exterior walls
//   are left out, so there are no layered faces.
import type { NormalizedSheet } from '../dwg/types';
import { rectMinus, ridgeLine, roofHeight, polygonArea, type Block, type FlatBlock, type GableBlock, type Vec2 } from './blocks';
import { pointInPolygon } from './fromPlan';
import type { OpeningRect } from './openings';

export const WALL_LAYERS = ['I-WALL', 'I-WALL-1', 'A-WALL', 'A-WALL-1'];
const EXTERIOR_LAYER = 'I-WALL';
const PARTITION_LAYERS = ['A-WALL', 'A-WALL-1'];
/** Exterior wall thickness (m) when the plans give none (PAB-01 and PAB-02 both measure 0.475). */
export const FALLBACK_THICKNESS = 0.475;
const PAIR_MIN = 0.05;
/**
 * Partitions stop this far (m) inside the roof / the slab above and the floor slab below, instead of exactly on them:
 * coplanar faces z-fight (flicker), and their top edges drew lines on the roof.
 */
const TUCK = 0.02;
/** The outer shell ends this far (m) under the roof planes, not on them (its top edge z-fought with the roof). */
const EAVE_TUCK = 0.01;
const PAIR_MAX = 0.35;
const PAIR_OVERLAP = 0.1;
/** A façade opening cuts the shell edge whose outer face lies this close (m) to where it was placed. */
const AT_FACE = 0.25;
/** A flat block hosts walls of a storey if it stands on the ground there and is at least this tall above it (m). */
const HOST_MIN_HEIGHT = 2;

export type Storey = { file: string; z: number; sheet: NormalizedSheet };
export type StoreyWalls = { file: string; z: number; partitions: number; length: number };
/** An opening as placed on the solid blocks (M5 T3). */
export type OpeningIn = { rect: OpeningRect; e: { origin: Vec2; dir: Vec2 }; depth: number };
export type Walls = { triangles: number[]; storeys: StoreyWalls[]; thickness: number; thicknessFound: boolean; hole: boolean[] };

/** Flat blocks whose walls come from storey `z`'s plan (the annex): standing on the ground there, ≥ 2 m tall, > 4 m². */
export const hostsWalls = (b: Block, z: number): b is FlatBlock =>
  b.kind === 'flat' && b.bottom <= z + 0.5 && b.top >= z + HOST_MIN_HEIGHT && polygonArea(b.polygon) > 4;

type Seg = { a: Vec2; b: Vec2 };

function segs(sheet: NormalizedSheet, layers: string[]): Seg[] {
  const out: Seg[] = [];
  const seen = new Set<string>();
  for (const l of sheet.layers) {
    if (!layers.includes(l.name)) continue;
    const s = l.segments;
    for (let i = 0; i < s.length; i += 4) {
      const a = { x: s[i]!, y: s[i + 1]! };
      const b = { x: s[i + 2]!, y: s[i + 3]! };
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.02) continue;
      // The same line on two layers counts once.
      const key = [a, b]
        .map((p) => `${Math.round(p.x * 500)},${Math.round(p.y * 500)}`)
        .sort()
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b });
    }
  }
  return out;
}

const sub = (p: Vec2, q: Vec2) => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (p: Vec2, q: Vec2) => p.x * q.x + p.y * q.y;
const len = (p: Vec2) => Math.hypot(p.x, p.y);

/** For two parallel lines: their distance and the overlap interval along the first (parameters in m). */
function parallelPair(s: Seg, o: Seg): { d: number; t0: number; t1: number; side: number } | undefined {
  const L = len(sub(s.b, s.a));
  const u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
  const n = { x: -u.y, y: u.x };
  const ov = sub(o.b, o.a);
  if (Math.abs(u.x * ov.y - u.y * ov.x) > 1e-3 * len(ov)) return undefined;
  const da = dot(sub(o.a, s.a), n);
  const db = dot(sub(o.b, s.a), n);
  if (Math.abs(da - db) > 0.002) return undefined;
  const ta = dot(sub(o.a, s.a), u);
  const tb = dot(sub(o.b, s.a), u);
  const t0 = Math.max(0, Math.min(ta, tb));
  const t1 = Math.min(L, Math.max(ta, tb));
  if (t1 - t0 < PAIR_OVERLAP) return undefined;
  return { d: Math.abs(da), t0, t1, side: Math.sign(da) };
}

/** The exterior wall thickness: the most common `I-WALL` pair distance (0.3–0.7 m), weighted by overlap length. */
export function wallThickness(sheet: NormalizedSheet): number | undefined {
  const ls = segs(sheet, [EXTERIOR_LAYER]).filter((s) => len(sub(s.b, s.a)) >= 0.5);
  const hist = new Map<number, number>();
  for (const s of ls)
    for (const o of ls) {
      if (o === s) continue;
      const p = parallelPair(s, o);
      if (!p || p.d < 0.3 || p.d > 0.7) continue;
      const k = Math.round(p.d * 200) / 200;
      hist.set(k, (hist.get(k) ?? 0) + p.t1 - p.t0);
    }
  let best: number | undefined;
  for (const [k, v] of hist) if (best === undefined || v > hist.get(best)!) best = k;
  return best;
}

/** Prism over a plan quad (or any convex ring) from `bottom` to per-corner tops. */
function prism(out: number[], ring: Vec2[], bottom: number, tops: number[]) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    out.push(a.x, a.y, bottom, b.x, b.y, bottom, b.x, b.y, tops[(i + 1) % n]!, a.x, a.y, bottom, b.x, b.y, tops[(i + 1) % n]!, a.x, a.y, tops[i]!);
  }
  for (let i = 1; i + 1 < n; i++) {
    const [a, b, c] = [ring[0]!, ring[i]!, ring[i + 1]!];
    out.push(a.x, a.y, tops[0]!, b.x, b.y, tops[i]!, c.x, c.y, tops[i + 1]!);
    out.push(a.x, a.y, bottom, c.x, c.y, bottom, b.x, b.y, bottom);
  }
}

/** A counter-clockwise ring (positive area). */
function ccw(ring: Vec2[]): Vec2[] {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a < 0 ? [...ring].reverse() : ring;
}

/** Mitred inner corners of a CCW ring offset inwards by t. */
function innerRing(ring: Vec2[], t: number): Vec2[] {
  const n = ring.length;
  const normal = (i: number) => {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const L = len(sub(b, a));
    return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }; // left of a→b = inside for CCW
  };
  return ring.map((p, i) => {
    const n0 = normal((i + n - 1) % n);
    const n1 = normal(i);
    const k = t / (1 + dot(n0, n1));
    return { x: p.x + (n0.x + n1.x) * k, y: p.y + (n0.y + n1.y) * k };
  });
}

type Gap = { s0: number; s1: number; y0: number; y1: number };

/**
 * One shell edge: outer a→b, inner ia→ib, from `bottom` to `top(p)`; the gaps (openings: along-edge interval and
 * sill/head) are left out. Split at every gap end and at the ridge, so each piece is a convex quad.
 */
function shellEdge(out: number[], a: Vec2, b: Vec2, ia: Vec2, ib: Vec2, bottom: number, top: (p: Vec2) => number, gaps: Gap[], ridge?: (p: Vec2) => number) {
  const L = len(sub(b, a));
  const cuts = new Set<number>([0, L]);
  for (const g of gaps) for (const s of [g.s0, g.s1]) if (s > 0 && s < L) cuts.add(s);
  if (ridge) {
    const ra = ridge(a);
    const rb = ridge(b);
    if (ra * rb < 0) cuts.add((ra / (ra - rb)) * L);
  }
  const ss = [...cuts].sort((p, q) => p - q);
  const outer = (s: number) => ({ x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L });
  const inner = (s: number) => ({ x: ia.x + ((ib.x - ia.x) * s) / L, y: ia.y + ((ib.y - ia.y) * s) / L });
  for (let k = 0; k + 1 < ss.length; k++) {
    const [s0, s1] = [ss[k]!, ss[k + 1]!];
    if (s1 - s0 < 1e-4) continue;
    const ring = [outer(s0), outer(s1), inner(s1), inner(s0)];
    const tops = ring.map(top);
    const mid = (s0 + s1) / 2;
    // Solid height intervals: [bottom, top] minus the openings over this piece.
    const holes = gaps.filter((g) => g.s0 <= mid && g.s1 >= mid).sort((p, q) => p.y0 - q.y0);
    let lo = bottom;
    for (const h of holes) {
      if (h.y0 > lo + 1e-3) prism(out, ring, lo, ring.map(() => Math.min(h.y0, Math.min(...tops))));
      lo = Math.max(lo, h.y1);
    }
    if (tops.every((tp) => tp > lo + 1e-3)) prism(out, ring, lo, tops);
  }
}

/** Distance from p to segment a–b. */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return len(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
}

export function hollowWalls(storeys: Storey[], blocks: Block[], openings: OpeningIn[]): Walls {
  const sorted = [...storeys].sort((a, b) => a.z - b.z);
  const z0 = sorted[0]?.z ?? 0;
  const main = blocks.find((b): b is GableBlock => b.kind === 'gable');
  const hosts = blocks.filter((b) => hostsWalls(b, z0));
  const measured = sorted.length ? wallThickness(sorted[0]!.sheet) : undefined;
  const t = measured ?? FALLBACK_THICKNESS;
  const out: number[] = [];
  const hole = openings.map(() => false);
  const roof = main ? (p: Vec2) => roofHeight(main, p.x, p.y) : undefined;
  const ridge = main
    ? (p: Vec2) => {
        const r = ridgeLine(main);
        return (r.alongX ? p.y : p.x) - r.at;
      }
    : undefined;

  /** Openings on edge a→b (outer face): along-edge interval and sill/head; marks them as holes. */
  const gapsOn = (a: Vec2, b: Vec2): Gap[] => {
    const L = len(sub(b, a));
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const gaps: Gap[] = [];
    openings.forEach((o, i) => {
      const { dir, origin } = o.e;
      if (Math.abs(u.x * dir.y - u.y * dir.x) > 1e-3) return; // not parallel to this edge
      const v = { x: -dir.y, y: dir.x };
      const at = (x: number) => ({ x: origin.x + x * dir.x + o.depth * v.x, y: origin.y + x * dir.y + o.depth * v.y });
      const p0 = at(o.rect.x0);
      const p1 = at(o.rect.x1);
      // The face it was placed on must be this edge.
      if (Math.abs(dot(sub(p0, a), { x: -u.y, y: u.x })) > AT_FACE) return;
      const s0 = Math.max(0, Math.min(dot(sub(p0, a), u), dot(sub(p1, a), u)));
      const s1 = Math.min(L, Math.max(dot(sub(p0, a), u), dot(sub(p1, a), u)));
      if (s1 - s0 < 0.05) return;
      gaps.push({ s0, s1, y0: o.rect.y0, y1: o.rect.y1 });
      hole[i] = true;
    });
    return gaps;
  };

  const shell = (ring: Vec2[], bottom: number, top: (p: Vec2) => number, skip?: (a: Vec2, b: Vec2) => boolean, roofRidge = false) => {
    const r = ccw(ring);
    const inner = innerRing(r, t);
    for (let i = 0; i < r.length; i++) {
      const j = (i + 1) % r.length;
      if (skip?.(r[i]!, r[j]!)) continue;
      shellEdge(out, r[i]!, r[j]!, inner[i]!, inner[j]!, bottom, top, gapsOn(r[i]!, r[j]!), roofRidge ? ridge : undefined);
    }
  };

  if (main && roof) {
    const underRoof = (p: Vec2) => roof(p) - EAVE_TUCK;
    const rect = [
      { x: main.x0, y: main.y0 },
      { x: main.x1, y: main.y0 },
      { x: main.x1, y: main.y1 },
      { x: main.x0, y: main.y1 },
    ];
    const recesses = main.recesses ?? [];
    if (recesses.length) {
      // Below the soffits the shell follows the recesses; above, the full rectangle up to the roof.
      const T = Math.max(...recesses.map((q) => q.top));
      const [lower] = rectMinus(main, recesses);
      if (lower) shell(lower, main.bottom, () => T);
      shell(rect, T, underRoof, undefined, true);
    } else shell(rect, main.bottom, underRoof, undefined, true);
  }
  // The annex: its own shell, without the edges standing on the main body's wall.
  const onMain = (a: Vec2, b: Vec2) =>
    !!main && [a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }].every((p) => {
      const inX = p.x > main.x0 - 0.05 && p.x < main.x1 + 0.05;
      const inY = p.y > main.y0 - 0.05 && p.y < main.y1 + 0.05;
      return inX && inY && (Math.abs(p.x - main.x0) < 0.05 || Math.abs(p.x - main.x1) < 0.05 || Math.abs(p.y - main.y0) < 0.05 || Math.abs(p.y - main.y1) < 0.05);
    });
  for (const h of hosts) shell(h.polygon, h.bottom, () => h.top, onMain);

  // Partitions per storey: pairs of parallel lines inside a hollow block, clear of the shell.
  const rings: Vec2[][] = [
    ...(main ? [[{ x: main.x0, y: main.y0 }, { x: main.x1, y: main.y0 }, { x: main.x1, y: main.y1 }, { x: main.x0, y: main.y1 }]] : []),
    ...hosts.map((h) => h.polygon),
  ];
  const inside = (p: Vec2) =>
    rings.some((r) => pointInPolygon(p, r) && r.every((q, i) => segDist(p, q, r[(i + 1) % r.length]!) > t - 0.02));
  const storeysOut: StoreyWalls[] = sorted.map((st, k) => {
    const next = sorted[k + 1]?.z;
    const lines = segs(st.sheet, PARTITION_LAYERS).filter((s) => inside(s.a) && inside(s.b));
    let partitions = 0;
    let length = 0;
    const done = new Set<string>();
    lines.forEach((s, i) => {
      // The nearest parallel partner on each side: a wall drawn with three lines gives two walls, not three.
      const best = new Map<number, { j: number; p: NonNullable<ReturnType<typeof parallelPair>> }>();
      lines.forEach((o, j) => {
        if (j === i) return;
        const p = parallelPair(s, o);
        if (!p || p.d < PAIR_MIN || p.d > PAIR_MAX) return;
        const cur = best.get(p.side);
        if (!cur || p.d < cur.p.d) best.set(p.side, { j, p });
      });
      for (const { j, p } of best.values()) {
        const key = `${Math.min(i, j)}|${Math.max(i, j)}`;
        if (done.has(key)) continue;
        done.add(key);
        const L = len(sub(s.b, s.a));
        const u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
        const n = { x: -u.y * p.side * p.d, y: u.x * p.side * p.d };
        const q0 = { x: s.a.x + u.x * p.t0, y: s.a.y + u.y * p.t0 };
        const q1 = { x: s.a.x + u.x * p.t1, y: s.a.y + u.y * p.t1 };
        const ring = [q0, q1, { x: q1.x + n.x, y: q1.y + n.y }, { x: q0.x + n.x, y: q0.y + n.y }];
        const top = (q: Vec2) => {
          const r = roof ? roof(q) : Infinity;
          return Math.min(next ?? r, r) - TUCK;
        };
        // Split at the ridge so the top follows both roof planes.
        const rp = ridge && next === undefined ? [ridge(q0), ridge(q1)] : [0, 0];
        if (rp[0]! * rp[1]! < 0) {
          const f = rp[0]! / (rp[0]! - rp[1]!);
          const m0 = { x: q0.x + (q1.x - q0.x) * f, y: q0.y + (q1.y - q0.y) * f };
          const m1 = { x: m0.x + n.x, y: m0.y + n.y };
          for (const half of [
            [q0, m0, m1, ring[3]!],
            [m0, q1, ring[2]!, m1],
          ])
            prism(out, half, st.z - TUCK, half.map(top));
        } else prism(out, ring, st.z - TUCK, ring.map(top));
        partitions++;
        length += p.t1 - p.t0;
      }
    });
    return { file: st.file, z: st.z, partitions, length };
  });
  return { triangles: out, storeys: storeysOut, thickness: t, thicknessFound: measured !== undefined, hole };
}
