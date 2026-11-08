// Level reference and absolute level labels with their measured points (PLAN.md §5 M2). Pure; runs in the worker
// on raw model-space entities (normalize drops circle centres and entity identity).
import { decodePercent, stripMtext } from './mtext';
import type { ArcIn, CircleIn, LevelKind, LevelLabel, LwPolylineIn, MTextIn, P2, P3, RawEntity, SheetLabels, TextIn } from './types';

const MM_TO_M = 0.001;
/** Leader ends vs rectangle edge / circle centre (m). Measured < 1 mm on PZT-01. */
const LEADER_TOL = 0.005;
/** Circle y vs value − reference (m). Measured ≤ 5 mm on every elevation label. */
const HEIGHT_TOL = 0.01;
/** Marker circles are small (0.03 m elevations, 0.1 m PZT-01). */
const MAX_CIRCLE_R = 0.25;

// `0,00= +355.40 m npm` (also `±0.00 = …`).
const REFERENCE = /^[±+]?\s*0[.,]00\s*=\s*\+?(\d{3}[.,]\d{1,3})\s*m?\s*n\.?\s*p\.?\s*m/i;
// `Tp= 355,08`, `Tp= +355.08`, `Ti= +354.54`, `Tp=Ti= +352.65 m npm`.
const TAGGED = /^(Tp\s*=\s*Ti|Ti\s*=\s*Tp|Tp|Ti)\s*=\s*\+?(\d{3}[.,]\d{1,3})(?:\s*m\s*n\.?\s*p\.?\s*m\.?)?$/i;
// Bare `+355.08`: the plus and 3 integer digits keep relative levels (`+9.12`) and dimensions out.
const BARE = /^\+(\d{3}[.,]\d{1,3})(?:\s*m\s*n\.?\s*p\.?\s*m\.?)?$/i;

const num = (s: string) => Number(s.replace(',', '.'));
/** OCS → WCS for the ±Z extrusions of 2D drawings (−Z mirrors x), then mm → m. */
const wcs = (x: number, y: number, ext?: P3): P2 => ({ x: (ext && ext.z < 0 ? -x : x) * MM_TO_M, y: y * MM_TO_M });
const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);

function parseLine(line: string): { reference: number } | { kind: LevelKind; value: number } | undefined {
  const s = line.replace(/\s+/g, ' ').trim();
  let m = REFERENCE.exec(s);
  if (m) return { reference: num(m[1]!) };
  m = TAGGED.exec(s);
  if (m) {
    const tag = m[1]!.replace(/\s/g, '').toLowerCase();
    return { kind: tag === 'tp' ? 'Tp' : tag === 'ti' ? 'Ti' : 'TpTi', value: num(m[2]!) };
  }
  m = BARE.exec(s);
  if (m) return { kind: 'bare', value: num(m[1]!) };
  return undefined;
}

type Circle = { c: P2; r: number; layer: string };
type Arc = { a: P2; b: P2 };
type Rect = { pts: P2[]; area: number };

function pointInPolygon(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToPolygon(p: P2, poly: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

const polygonArea = (pts: P2[]) =>
  Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]!; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;

/** Site rule: the smallest closed polyline around the text; an ARC with one end on it and the other on a circle centre. */
function leaderPoint(at: P2, rects: Rect[], arcs: Arc[], circles: Circle[]): P2 | undefined {
  const rect = rects.filter((r) => pointInPolygon(at, r.pts) || distToPolygon(at, r.pts) <= LEADER_TOL).sort((a, b) => a.area - b.area)[0];
  if (!rect) return undefined;
  for (const { a, b } of arcs)
    for (const [onRect, far] of [[a, b], [b, a]] as const) {
      if (distToPolygon(onRect, rect.pts) > LEADER_TOL) continue;
      const hit = circles.find((c) => dist(c.c, far) <= LEADER_TOL);
      if (hit) return hit.c;
    }
  return undefined;
}

/** Vertical rule: nearest same-layer circle whose sheet y is the label's relative height. */
function heightPoint(at: P2, layer: string, value: number, reference: number, circles: Circle[]): P2 | undefined {
  const rel = value - reference;
  let best: Circle | undefined;
  for (const c of circles)
    if (c.layer === layer && Math.abs(c.c.y - rel) <= HEIGHT_TOL && (!best || dist(c.c, at) < dist(best.c, at))) best = c;
  return best?.c;
}

/** `modelSpace` = handle of *Model_Space (as in normalize). Only top-level model-space entities are read. */
export function extractLabels(entities: readonly RawEntity[], modelSpace: string | undefined): SheetLabels {
  const circles: Circle[] = [];
  const arcs: Arc[] = [];
  const rects: Rect[] = [];
  const found: { kind: LevelKind; value: number; text: string; layer: string; at: P2 }[] = [];
  const references: number[] = [];

  const addText = (raw: string, at: P2, layer: string) => {
    for (const line of raw.split('\n')) {
      const r = parseLine(line);
      if (!r) continue;
      if ('reference' in r) references.push(r.reference);
      else found.push({ ...r, text: line.trim(), layer, at });
    }
  };

  for (const e of entities) {
    if (modelSpace !== undefined && e.ownerBlockRecordSoftId !== modelSpace) continue;
    switch (e.type) {
      case 'CIRCLE': {
        const c = e as CircleIn;
        if (c.radius * MM_TO_M <= MAX_CIRCLE_R) circles.push({ c: wcs(c.center.x, c.center.y, c.extrusionDirection), r: c.radius * MM_TO_M, layer: e.layer });
        break;
      }
      case 'ARC': {
        const a = e as ArcIn;
        const end = (ang: number) => wcs(a.center.x + a.radius * Math.cos(ang), a.center.y + a.radius * Math.sin(ang), a.extrusionDirection);
        arcs.push({ a: end(a.startAngle), b: end(a.endAngle) });
        break;
      }
      case 'LWPOLYLINE': {
        const p = e as LwPolylineIn;
        if ((p.flag & 0x200) === 0 || p.vertices.length < 3) break;
        const pts = p.vertices.map((v) => wcs(v.x, v.y, p.extrusionDirection));
        rects.push({ pts, area: polygonArea(pts) });
        break;
      }
      case 'MTEXT': {
        const t = e as MTextIn;
        addText(stripMtext(t.text).text, wcs(t.insertionPoint.x, t.insertionPoint.y), e.layer);
        break;
      }
      case 'TEXT': {
        const t = e as TextIn;
        addText(decodePercent(t.text), wcs(t.startPoint.x, t.startPoint.y), e.layer);
        break;
      }
    }
  }

  const reference = references[0];
  const levels: LevelLabel[] = found.map((l) => ({
    ...l,
    leader: leaderPoint(l.at, rects, arcs, circles),
    byHeight: reference === undefined ? undefined : heightPoint(l.at, l.layer, l.value, reference, circles),
  }));
  return { references, levels };
}

/** The point that counts for this sheet kind (site: leader; elevation/section: height match; others: none). */
export function levelPoint(l: LevelLabel, kind: string): P2 | undefined {
  return kind === 'site' ? l.leader : kind === 'elevation' || kind === 'section' ? l.byHeight : undefined;
}
