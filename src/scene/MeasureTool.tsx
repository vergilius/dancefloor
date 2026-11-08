// Measure tool "Pomiar" (PLAN.md §5 M2), Design viewport only: click A, then B, on the drawn horizontal sheets.
// Snaps to visible segment endpoints of the sheets under the cursor and to the level markers (screen px).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Matrix4, Raycaster, Vector2 } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { layerVisible, type LayerOverrides } from '../project/layerGroups';
import type { SheetKind } from '../project/projectFile';
import { formatHeight, formatRel } from '../project/levels';
import { useRefValue } from '../state/levels';
import { useProject } from '../state/store';
import { t } from '../ui/strings';
import { toScene, type SheetPlacement } from './coords';
import { Dot } from './Dot';
import { useLevelMarkers } from './LevelMarkers';
import { CLICK_PX, hitHorizontal, nearestOnScreen, SNAP_PX, worldPoints, type Vec3 } from './snap';
import { designHtmlPosition, halfAt } from './split';

type Drawn = { file: string; kind: SheetKind; placement: SheetPlacement; sheet: NormalizedSheet; layers?: LayerOverrides };
type Pick = { world: Vec3; snapped: boolean };

const COLORS = { line: '#cf222e', snapped: '#1a7f37', free: '#6e7781' };

const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const horizontal = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function MeasureTool({ drawn }: { drawn: Drawn[] }) {
  const measure = useProject((s) => s.measure);
  const pickMeasure = useProject((s) => s.pickMeasure);
  const stopMeasure = useProject((s) => s.stopMeasure);
  const groups = useProject((s) => s.groups);
  const showLevels = useProject((s) => s.showLevels);
  const markers = useLevelMarkers(drawn);
  const camera = useThree((s) => s.camera);
  const el = useThree((s) => s.events.connected) as HTMLElement | undefined;
  const [hover, setHover] = useState<Pick>();
  const on = measure !== undefined;

  // Horizontal sheets with their visible endpoints (world), only while the tool is on.
  const targets = useMemo(
    () =>
      on
        ? drawn.flatMap((d) =>
            d.placement.type === 'horizontal' && d.sheet.extents
              ? [{ placement: d.placement, extents: d.sheet.extents, points: worldPoints(d.sheet, d.placement, (l) => layerVisible(groups, d.layers, l)) }]
              : [],
          )
        : [],
    [on, drawn, groups],
  );
  const markerPoints = useMemo(() => Float64Array.from(showLevels ? markers.flatMap((m) => m.world) : []), [markers, showLevels]);

  /** The point under the cursor (design half only): a snap point, else the nearest sheet plane hit, else none. */
  const pickAt = (clientX: number, clientY: number): Pick | undefined => {
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const { half, ndc } = halfAt(clientX, clientY, rect);
    if (half !== 'design') return undefined;
    raycaster.setFromCamera(new Vector2(...ndc), camera);
    const { origin, direction } = raycaster.ray;
    const ray = { origin: origin.toArray() as Vec3, dir: direction.toArray() as Vec3 };
    const hits = targets
      .flatMap((tg) => {
        const h = hitHorizontal(ray, tg.placement, tg.extents);
        return h ? [{ ...h, points: tg.points }] : [];
      })
      .sort((a, b) => a.t - b.t);
    const m = matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const pointer: [number, number] = [clientX - rect.left, clientY - rect.top];
    const snapped = nearestOnScreen([...hits.map((h) => h.points), markerPoints], m, pointer, Math.floor(rect.width / 2), rect.height, SNAP_PX);
    if (snapped) return { world: snapped, snapped: true };
    return hits[0] && { world: hits[0].world, snapped: false };
  };
  const pickRef = useRef(pickAt);
  useEffect(() => {
    pickRef.current = pickAt;
  });

  useEffect(() => {
    if (!on || !el) return;
    let down: [number, number] | undefined;
    const onMove = (e: PointerEvent) => setHover(pickRef.current(e.clientX, e.clientY));
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? [e.clientX, e.clientY] : undefined;
    };
    const onUp = (e: PointerEvent) => {
      // A drag (orbit, pan) doesn't place a pick.
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > CLICK_PX) return;
      down = undefined;
      const p = pickRef.current(e.clientX, e.clientY);
      if (p) pickMeasure(p.world);
    };
    const onLeave = () => setHover(undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stopMeasure();
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      setHover(undefined);
    };
  }, [on, el, pickMeasure, stopMeasure]);

  if (!measure) return null;
  const [a, b] = measure.picks;
  // After A: a live line to the cursor. After A and B: the next click starts a new measurement.
  const preview = a && !b && hover ? hover.world : undefined;
  return (
    <>
      {a && <Dot p={a} color={COLORS.line} size={10} />}
      {b && <Dot p={b} color={COLORS.line} size={10} />}
      {a && (b ?? preview) && <Segment a={a} b={(b ?? preview)!} />}
      {hover && (
        <>
          <Dot p={hover.world} color={hover.snapped ? COLORS.snapped : COLORS.free} size={hover.snapped ? 12 : 7} />
          <Html position={toScene(...hover.world)} calculatePosition={designHtmlPosition} style={{ pointerEvents: 'none' }}>
            <div className="align-cursor" style={{ borderColor: COLORS.line }}>
              <strong>{preview ? 'B' : 'A'}</strong>
              {preview && a && <> · {dist(a, preview).toFixed(3)} m</>} · {hover.snapped ? t.measure.snapped : t.measure.free}
            </div>
          </Html>
        </>
      )}
    </>
  );
}

const raycaster = new Raycaster();
const matrix = new Matrix4();

function Segment({ a, b }: { a: Vec3; b: Vec3 }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([...toScene(...a), ...toScene(...b)]), 3));
    return g;
  }, [a, b]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} renderOrder={10}>
      <lineBasicMaterial color={COLORS.line} depthTest={false} />
    </lineSegments>
  );
}

/** Readout over the design half: prompt, both heights (rel + abs), 3D and horizontal distance, Δh. */
export function MeasureReadout() {
  const measure = useProject((s) => s.measure);
  const ref = useRefValue();
  if (!measure) return null;
  const [a, b] = measure.picks;
  return (
    <div className="measure-readout">
      <div className="muted">
        {!a ? t.measure.pickA : !b ? t.measure.pickB : t.measure.again} · {t.measure.escHint}
      </div>
      {a && <div>A: {formatHeight(a[2], ref, 3)}</div>}
      {b && (
        <>
          <div>B: {formatHeight(b[2], ref, 3)}</div>
          <div>
            {t.measure.distance}: <strong>{dist(a!, b).toFixed(3)} m</strong>
          </div>
          <div>
            {t.measure.horizontal}: {horizontal(a!, b).toFixed(3)} m
          </div>
          <div>Δh: {formatRel(b[2] - a![2], 3)} m</div>
        </>
      )}
    </div>
  );
}
