// DWG entities (mm) → line segments in metres, grouped by layer, with INSERTs expanded. Pure; runs in the worker.
import { apply, compose, insertMatrices, type Mat } from './insert';
import { decodePercent, stripMtext } from './mtext';
import type {
  ArcIn,
  BlockIn,
  CircleIn,
  EllipseIn,
  InsertIn,
  LineIn,
  LwPolylineIn,
  MTextIn,
  NormalizedSheet,
  NormalizedText,
  P2,
  P3,
  RawEntity,
  SplineIn,
  TextIn,
} from './types';

const MM_TO_M = 0.001;
/** Max chord error for arcs, in drawing units (mm). */
const CHORD_TOL = 1;
/** Samples per non-empty knot span of a spline. */
const SPLINE_SAMPLES_PER_SPAN = 16;

type Pt = [number, number];

/** Number of chords for a sweep of |sweep| rad at radius r so the sagitta stays ≤ CHORD_TOL. */
function chordCount(r: number, sweep: number): number {
  const step = r > CHORD_TOL ? 2 * Math.acos(1 - CHORD_TOL / r) : Math.PI / 2;
  return Math.max(1, Math.ceil(Math.abs(sweep) / step));
}

/** Points along an arc from angle a0, sweeping `sweep` rad (signed: + = CCW). Includes both ends. */
function arcPoints(cx: number, cy: number, r: number, a0: number, sweep: number): Pt[] {
  const n = chordCount(r, sweep);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** OCS → WCS for planar entities: only the ±Z extrusions that occur in 2D drawings (−Z mirrors x). */
const ocs = (pts: Pt[], ext?: P3): Pt[] => (ext && ext.z < 0 ? pts.map(([x, y]) => [-x, y]) : pts);

function arc(e: ArcIn): Pt[] {
  let sweep = e.endAngle - e.startAngle;
  if (sweep <= 0) sweep += 2 * Math.PI; // ARCs always run CCW from start to end
  return ocs(arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, sweep), e.extrusionDirection);
}

function circle(e: CircleIn): Pt[] {
  return ocs(arcPoints(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI), e.extrusionDirection);
}

/** P(t) = C + M·cos t + m·sin t, m = (N × M)·ratio. N = −Z flips m, so the ellipse turns the other way. */
function ellipse(e: EllipseIn): Pt[] {
  const { x: cx, y: cy } = e.center;
  const { x: mx, y: my } = e.majorAxisEndPoint;
  const s = (e.extrusionDirection && e.extrusionDirection.z < 0 ? -1 : 1) * e.axisRatio;
  let sweep = e.endAngle - e.startAngle;
  if (sweep <= 0) sweep += 2 * Math.PI;
  // Chord count from the major radius: a simple, slightly generous bound for typical ratios.
  const n = chordCount(Math.hypot(mx, my), sweep);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = e.startAngle + (sweep * i) / n;
    const c = Math.cos(t);
    const si = Math.sin(t);
    pts.push([cx + mx * c - my * s * si, cy + my * c + mx * s * si]);
  }
  return pts;
}

/** Bulge segment p→q: included angle θ = 4·atan(bulge), positive = CCW. Returns points after p up to q. */
function bulgePoints(p: P2, q: P2, bulge: number): Pt[] {
  if (bulge === 0) return [[q.x, q.y]];
  const theta = 4 * Math.atan(bulge);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return [];
  // Centre sits on the chord's perpendicular bisector; cot(θ/2) is signed, so it lands on the right side.
  const k = 0.5 / Math.tan(theta / 2);
  const cx = (p.x + q.x) / 2 - dy * k;
  const cy = (p.y + q.y) / 2 + dx * k;
  const r = Math.hypot(p.x - cx, p.y - cy);
  const pts = arcPoints(cx, cy, r, Math.atan2(p.y - cy, p.x - cx), theta).slice(1);
  pts[pts.length - 1] = [q.x, q.y]; // land exactly on the vertex
  return pts;
}

function lwpolyline(e: LwPolylineIn): Pt[] {
  const v = e.vertices;
  if (v.length < 2) return [];
  const closed = (e.flag & 0x200) !== 0;
  const pts: Pt[] = [[v[0]!.x, v[0]!.y]];
  const last = closed ? v.length : v.length - 1;
  for (let i = 0; i < last; i++) {
    const a = v[i]!;
    pts.push(...bulgePoints(a, v[(i + 1) % v.length]!, a.bulge));
  }
  return ocs(pts, e.extrusionDirection);
}

/** Rational B-spline via de Boor. Falls back to fit points, then the control polygon, if the data is inconsistent. */
function spline(e: SplineIn): Pt[] {
  const { degree: p, knots, controlPoints: cp } = e;
  const w = e.weights?.length === cp.length ? e.weights : undefined;
  if (p < 1 || cp.length <= p || knots.length !== cp.length + p + 1) {
    const fallback = e.fitPoints.length >= 2 ? e.fitPoints : cp;
    return fallback.map((q) => [q.x, q.y]);
  }
  const n = cp.length;
  const pts: Pt[] = [];
  for (let k = p; k < n; k++) {
    const t0 = knots[k]!;
    const t1 = knots[k + 1]!;
    if (t1 <= t0) continue; // empty span
    for (let s = pts.length === 0 ? 0 : 1; s <= SPLINE_SAMPLES_PER_SPAN; s++) {
      const t = t0 + ((t1 - t0) * s) / SPLINE_SAMPLES_PER_SPAN;
      // Homogeneous control points of this span: (x·w, y·w, w).
      const d = Array.from({ length: p + 1 }, (_, j) => {
        const c = cp[k - p + j]!;
        const wj = w ? w[k - p + j]! : 1;
        return [c.x * wj, c.y * wj, wj];
      });
      for (let r = 1; r <= p; r++) {
        for (let j = p; j >= r; j--) {
          const i = k - p + j;
          const ki = knots[i]!;
          const den = knots[i + p - r + 1]! - ki;
          const a = den === 0 ? 0 : (t - ki) / den;
          const lo = d[j - 1]!;
          const hi = d[j]!;
          for (let c = 0; c < 3; c++) hi[c] = (1 - a) * lo[c]! + a * hi[c]!;
        }
      }
      const [hx, hy, hw] = d[p]!;
      pts.push([hx! / hw!, hy! / hw!]);
    }
  }
  return pts;
}

function tessellate(e: RawEntity): Pt[] | undefined {
  switch (e.type) {
    case 'LINE': {
      const l = e as LineIn;
      return [
        [l.startPoint.x, l.startPoint.y],
        [l.endPoint.x, l.endPoint.y],
      ];
    }
    case 'ARC':
      return arc(e as ArcIn);
    case 'CIRCLE':
      return circle(e as CircleIn);
    case 'ELLIPSE':
      return ellipse(e as EllipseIn);
    case 'LWPOLYLINE':
      return lwpolyline(e as LwPolylineIn);
    case 'SPLINE':
      return spline(e as SplineIn);
    default:
      return undefined; // HATCH, DIMENSION, …
  }
}

const MAX_DEPTH = 16;

/**
 * `modelSpace` = handle of the *Model_Space block record. libredwg-web returns paper-space entities in the same
 * list and never sets `isInPaperSpace`, so ownership is the only reliable test. Undefined = treat all as model space.
 */
export function normalize(
  entities: readonly RawEntity[],
  blocks: ReadonlyMap<string, BlockIn>,
  modelSpace: string | undefined,
): NormalizedSheet {
  const byLayer = new Map<string, number[]>();
  const drawn: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const count = (r: Record<string, number>, k: string) => (r[k] = (r[k] ?? 0) + 1);
  const texts: NormalizedText[] = [];
  let textLeftovers = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  /** Texts: anchor through the matrix; rotation and height follow the matrix's axes (block rotation/scale). */
  function emitText(raw: string, x0: number, y0: number, h: number, rot: number, attach: number, layer: string, m: Mat, mtext: boolean) {
    let text = decodePercent(raw);
    if (mtext) {
      const r = stripMtext(raw);
      text = r.text;
      if (r.leftover) {
        textLeftovers++;
        if (import.meta.env?.DEV) console.warn('MTEXT codes left after stripping:', JSON.stringify(raw));
      }
    }
    if (text.trim() === '') return;
    const [x, y] = apply(m, x0, y0);
    const dir = Math.atan2(m[1], m[0]);
    texts.push({ text, layer, x, y, height: h * Math.hypot(m[2], m[3]), rotation: rot + dir, attach });
  }

  /** `m` maps entity coordinates (mm) to sheet metres. `parentLayer` replaces layer 0 inside blocks. */
  function emit(e: RawEntity, m: Mat, parentLayer: string | undefined, stack: string[]): void {
    const layer = parentLayer !== undefined && e.layer === '0' ? parentLayer : e.layer;
    if (e.type === 'INSERT') {
      const ins = e as InsertIn;
      const block = blocks.get(ins.name);
      if (!block) return void count(skipped, 'INSERT (missing block)');
      if (stack.includes(ins.name)) return void count(skipped, 'INSERT (cycle)');
      if (stack.length >= MAX_DEPTH) return void count(skipped, 'INSERT (depth > 16)');
      count(drawn, 'INSERT');
      stack.push(ins.name);
      for (const cell of insertMatrices(ins, block.basePoint)) {
        const cm = compose(m, cell);
        for (const child of block.entities) emit(child, cm, layer, stack);
      }
      stack.pop();
      return;
    }
    if (e.type === 'MTEXT') {
      const t = e as MTextIn;
      const rot = t.direction && (t.direction.x !== 0 || t.direction.y !== 0) ? Math.atan2(t.direction.y, t.direction.x) : t.rotation;
      count(drawn, 'MTEXT');
      return emitText(t.text, t.insertionPoint.x, t.insertionPoint.y, t.textHeight, rot, t.attachmentPoint || 1, layer, m, true);
    }
    if (e.type === 'TEXT') {
      const t = e as TextIn;
      count(drawn, 'TEXT');
      return emitText(t.text, t.startPoint.x, t.startPoint.y, t.textHeight, t.rotation, 7, layer, m, false);
    }
    const pts = tessellate(e);
    if (!pts) return void count(skipped, e.type);
    count(drawn, e.type);
    let seg = byLayer.get(layer);
    if (!seg) byLayer.set(layer, (seg = []));
    let px = 0, py = 0;
    pts.forEach(([rx, ry], i) => {
      const [x, y] = apply(m, rx, ry);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (i > 0) seg.push(px, py, x, y);
      px = x;
      py = y;
    });
  }

  const root: Mat = [MM_TO_M, 0, 0, MM_TO_M, 0, 0];
  for (const e of entities) {
    if (modelSpace !== undefined && e.ownerBlockRecordSoftId !== modelSpace) count(skipped, '(paper space)');
    else emit(e, root, undefined, []);
  }

  const layers = [...byLayer]
    .map(([name, s]) => ({ name, segments: Float64Array.from(s) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return {
    layers,
    extents: minX <= maxX ? { minX, minY, maxX, maxY } : null,
    drawn,
    skipped,
    segmentCount: layers.reduce((n, l) => n + l.segments.length / 4, 0),
    texts,
    textLeftovers,
  };
}
