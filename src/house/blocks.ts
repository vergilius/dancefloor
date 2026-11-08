// House massing blocks (PLAN.md §5 M5, ADR 0005). Pure: types, strict parse, the main body from the roof plan,
// and block → triangles. Plan coords in m (x east, y north), heights rel. ±0.00.
import type { NormalizedSheet } from '../dwg/types';

export type Vec2 = { x: number; y: number };

/** Rectangle with a centred ridge along its long side; `overhang` only on the long sides (eaves). */
export type GableBlock = {
  kind: 'gable';
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bottom: number;
  ridge: number;
  /** Degrees. */
  pitch: number;
  overhang: number;
};

/** Polygon prism. */
export type FlatBlock = { kind: 'flat'; name: string; polygon: Vec2[]; bottom: number; top: number };

export type Block = GableBlock | FlatBlock;

export type House = { blocks: Block[]; hiddenOpenings: string[] };

export const EMPTY_HOUSE: House = { blocks: [], hiddenOpenings: [] };

/** Top of the shallowest foundation: walls reach into the sloped terrain without a gap. */
export const DEFAULT_BOTTOM = -1.4;
/** Used when the roof sheet has no single `NN°` label (flagged in the panel). */
export const FALLBACK_PITCH = 38;

export const ROOF_LAYER = 'A-ROOF';
export const ROOF_OUTLINE_LAYER = 'A-ROOF-OTLN';

const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
const mm = (v: number) => Math.round(v * 1000) / 1000;

/** Height where the roof surface meets the wall face: ridge − (short side / 2) × tan(pitch). */
export function wallFace(b: GableBlock): number {
  return b.ridge - (Math.min(b.x1 - b.x0, b.y1 - b.y0) / 2) * tan(b.pitch);
}

/** Polygon area (m², ≥ 0). */
export function polygonArea(p: Vec2[]): number {
  return Math.abs(signedArea(p));
}

function signedArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!;
    const r = p[(i + 1) % p.length]!;
    a += q.x * r.y - r.x * q.y;
  }
  return a / 2;
}

// ---------- strict parse (dancefloor.json `house`) ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (o: Record<string, unknown>, k: string, where: string): number => {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}.${k}: expected a number`);
  return v;
};

function parseBlock(v: unknown, where: string): Block {
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  if (typeof v.name !== 'string' || !v.name) throw new Error(`${where}.name: expected a non-empty string`);
  const name = v.name;
  const bottom = num(v, 'bottom', where);
  if (v.kind === 'gable') {
    const b: GableBlock = {
      kind: 'gable',
      name,
      x0: num(v, 'x0', where),
      y0: num(v, 'y0', where),
      x1: num(v, 'x1', where),
      y1: num(v, 'y1', where),
      bottom,
      ridge: num(v, 'ridge', where),
      pitch: num(v, 'pitch', where),
      overhang: num(v, 'overhang', where),
    };
    if (!(b.x1 > b.x0 && b.y1 > b.y0)) throw new Error(`${where}: expected x0 < x1 and y0 < y1`);
    if (!(b.pitch > 0 && b.pitch < 90)) throw new Error(`${where}.pitch: expected 0 < pitch < 90 (deg)`);
    if (!(b.overhang >= 0)) throw new Error(`${where}.overhang: expected ≥ 0`);
    if (!(wallFace(b) > bottom)) throw new Error(`${where}: the wall face is not above the bottom`);
    return b;
  }
  if (v.kind === 'flat') {
    const top = num(v, 'top', where);
    if (!(top > bottom)) throw new Error(`${where}: expected top > bottom`);
    if (!Array.isArray(v.polygon) || v.polygon.length < 3) throw new Error(`${where}.polygon: expected ≥ 3 corners`);
    const polygon = v.polygon.map((p, i) => {
      if (!isObj(p)) throw new Error(`${where}.polygon[${i}]: expected { x, y }`);
      return { x: num(p, 'x', `${where}.polygon[${i}]`), y: num(p, 'y', `${where}.polygon[${i}]`) };
    });
    return { kind: 'flat', name, polygon, bottom, top };
  }
  throw new Error(`${where}.kind: unknown "${String(v.kind)}"`);
}

/** Passes the same checks as a saved block (e.g. top above bottom). */
export function isValidBlock(b: Block): boolean {
  try {
    parseBlock(b, 'block');
    return true;
  } catch {
    return false;
  }
}

export function parseHouse(v: unknown, where = 'house'): House {
  if (!isObj(v)) throw new Error(`${where}: expected an object`);
  if (!Array.isArray(v.blocks)) throw new Error(`${where}.blocks: expected an array`);
  const blocks = v.blocks.map((b, i) => parseBlock(b, `${where}.blocks[${i}]`));
  const hidden = v.hiddenOpenings ?? [];
  if (!Array.isArray(hidden) || hidden.some((h) => typeof h !== 'string')) throw new Error(`${where}.hiddenOpenings: expected strings`);
  return { blocks, hiddenOpenings: hidden as string[] };
}

// ---------- "Z rzutu dachu" ----------

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function layerBox(sheet: NormalizedSheet, layer: string): Box | undefined {
  const s = sheet.layers.find((l) => l.name === layer)?.segments;
  if (!s || s.length === 0) return undefined;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < s.length; i += 2) {
    b.minX = Math.min(b.minX, s[i]!);
    b.maxX = Math.max(b.maxX, s[i]!);
    b.minY = Math.min(b.minY, s[i + 1]!);
    b.maxY = Math.max(b.maxY, s[i + 1]!);
  }
  return b;
}

export const hasRoofLayer = (sheet: NormalizedSheet) => layerBox(sheet, ROOF_LAYER) !== undefined;

/** Distinct `NN°` values (5…85) in the sheet's texts, in order of appearance. */
export function pitchLabels(sheet: NormalizedSheet): number[] {
  const out: number[] = [];
  for (const t of sheet.texts)
    for (const m of t.text.matchAll(/(\d+(?:[.,]\d+)?)\s*°/g)) {
      const v = Number(m[1]!.replace(',', '.'));
      if (v >= 5 && v <= 85 && !out.includes(v)) out.push(v);
    }
  return out;
}

export type MainBody = {
  block: GableBlock;
  /** Exactly one `NN°` label on the sheet; otherwise the pitch is FALLBACK_PITCH. */
  pitchFound: boolean;
  pitchLabels: number[];
  /** `A-ROOF-OTLN` present; otherwise overhang 0. */
  outlineFound: boolean;
};

/** The main body from a horizontal roof sheet at height `z` (its ridge). Undefined without an `A-ROOF` layer. */
export function mainBodyFromRoof(sheet: NormalizedSheet, z: number, name: string, bottom = DEFAULT_BOTTOM): MainBody | undefined {
  const r = layerBox(sheet, ROOF_LAYER);
  if (!r) return undefined;
  const o = layerBox(sheet, ROOF_OUTLINE_LAYER);
  const alongX = r.maxX - r.minX >= r.maxY - r.minY;
  // Long sides = parallel to the ridge: the eaves overhang there (mean of both sides).
  const overhang = !o ? 0 : alongX ? (r.minY - o.minY + (o.maxY - r.maxY)) / 2 : (r.minX - o.minX + (o.maxX - r.maxX)) / 2;
  const labels = pitchLabels(sheet);
  const pitchFound = labels.length === 1;
  return {
    block: {
      kind: 'gable',
      name,
      x0: mm(r.minX),
      y0: mm(r.minY),
      x1: mm(r.maxX),
      y1: mm(r.maxY),
      bottom,
      ridge: z,
      pitch: pitchFound ? labels[0]! : FALLBACK_PITCH,
      overhang: mm(Math.max(0, overhang)),
    },
    pitchFound,
    pitchLabels: labels,
    outlineFound: o !== undefined,
  };
}

/** Plan outline (corners in order). */
export function blockOutline(b: Block): Vec2[] {
  if (b.kind === 'flat') return b.polygon;
  return [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ];
}

// ---------- block → triangles ----------

type P3 = [number, number, number];

/** World triangles (x, y, z per vertex, 3 vertices per triangle). Winding is not guaranteed: draw double-sided. */
export function blockTriangles(b: Block): number[] {
  return b.kind === 'gable' ? gableTriangles(b) : flatTriangles(b);
}

function quad(out: number[], a: P3, b: P3, c: P3, d: P3) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function gableTriangles(b: GableBlock): number[] {
  const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
  // Local (u along the ridge, v across) → world.
  const [u0, u1, v0, v1] = alongX ? [b.x0, b.x1, b.y0, b.y1] : [b.y0, b.y1, b.x0, b.x1];
  const P = (u: number, v: number, h: number): P3 => (alongX ? [u, v, h] : [v, u, h]);
  const vc = (v0 + v1) / 2;
  const hw = wallFace(b);
  const he = hw - b.overhang * tan(b.pitch);
  const z0 = b.bottom;
  const out: number[] = [];
  // Walls up to the wall face, and the bottom.
  quad(out, P(u0, v0, z0), P(u1, v0, z0), P(u1, v0, hw), P(u0, v0, hw));
  quad(out, P(u1, v1, z0), P(u0, v1, z0), P(u0, v1, hw), P(u1, v1, hw));
  quad(out, P(u0, v1, z0), P(u0, v0, z0), P(u0, v0, hw), P(u0, v1, hw));
  quad(out, P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, hw), P(u1, v0, hw));
  quad(out, P(u0, v0, z0), P(u0, v1, z0), P(u1, v1, z0), P(u1, v0, z0));
  // Gable triangles on the short ends.
  out.push(...P(u0, v0, hw), ...P(u0, vc, b.ridge), ...P(u0, v1, hw));
  out.push(...P(u1, v1, hw), ...P(u1, vc, b.ridge), ...P(u1, v0, hw));
  // Roof planes, ridge → eave, out by the overhang on the long sides.
  quad(out, P(u0, v0 - b.overhang, he), P(u1, v0 - b.overhang, he), P(u1, vc, b.ridge), P(u0, vc, b.ridge));
  quad(out, P(u1, v1 + b.overhang, he), P(u0, v1 + b.overhang, he), P(u0, vc, b.ridge), P(u1, vc, b.ridge));
  return out;
}

function flatTriangles(b: FlatBlock): number[] {
  const p = signedArea(b.polygon) < 0 ? [...b.polygon].reverse() : b.polygon;
  const out: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const c = p[(i + 1) % p.length]!;
    quad(out, [a.x, a.y, b.bottom], [c.x, c.y, b.bottom], [c.x, c.y, b.top], [a.x, a.y, b.top]);
  }
  for (const [i, j, k] of earClip(p)) {
    const [a, c, d] = [p[i]!, p[j]!, p[k]!];
    out.push(a.x, a.y, b.top, c.x, c.y, b.top, d.x, d.y, b.top);
    out.push(a.x, a.y, b.bottom, d.x, d.y, b.bottom, c.x, c.y, b.bottom);
  }
  return out;
}

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Ear clipping of a simple CCW polygon → index triples. Falls back to a fan if it gets stuck (self-intersecting input). */
function earClip(p: Vec2[]): [number, number, number][] {
  const idx = p.map((_, i) => i);
  const tris: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10_000) {
    let clipped = false;
    for (let n = 0; n < idx.length; n++) {
      const i = idx[(n + idx.length - 1) % idx.length]!;
      const j = idx[n]!;
      const k = idx[(n + 1) % idx.length]!;
      if (cross(p[i]!, p[j]!, p[k]!) <= 1e-12) continue; // reflex or collinear
      const inside = idx.some(
        (m) => m !== i && m !== j && m !== k && cross(p[i]!, p[j]!, p[m]!) >= 0 && cross(p[j]!, p[k]!, p[m]!) >= 0 && cross(p[k]!, p[i]!, p[m]!) >= 0,
      );
      if (inside) continue;
      tris.push([i, j, k]);
      idx.splice(n, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  for (let n = 1; n + 1 < idx.length; n++) tris.push([idx[0]!, idx[n]!, idx[n + 1]!]);
  return tris;
}
