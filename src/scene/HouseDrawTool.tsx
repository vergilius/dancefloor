// House draw tool (PLAN.md §5 M5), Design viewport only: click a flat block's corners on the plans with endpoint
// snapping. Clicking the first corner or Enter closes it, Backspace drops the last corner, Esc cancels.
// The outline is drawn on the plan plane (z 0) with its edge lengths.
import { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Vec2 } from '../house/blocks';
import { useProject } from '../state/store';
import { t } from '../ui/strings';
import { toScene } from './coords';
import { Dot } from './Dot';
import { usePicker, type Pick, type PickDrawn } from './picker';
import { CLICK_PX } from './snap';
import { designHtmlPosition } from './split';

const COLOR = '#8250df';
const FREE_COLOR = '#6e7781';
const SNAP_COLOR = '#1a7f37';
/** A pick this close (m) to the first corner closes the outline. */
const CLOSE_M = 0.001;

const isField = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

export function HouseDrawTool({ drawn }: { drawn: PickDrawn[] }) {
  const draw = useProject((s) => s.houseDraw);
  const on = draw !== undefined;
  const { pickRef, el } = usePicker(on, drawn, true);
  const [hover, setHover] = useState<Pick>();

  useEffect(() => {
    if (!on || !el) return;
    const st = useProject.getState;
    let down: [number, number] | undefined;
    const onMove = (e: PointerEvent) => setHover(pickRef.current(e.clientX, e.clientY));
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? [e.clientX, e.clientY] : undefined;
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > CLICK_PX) return;
      down = undefined;
      const p = pickRef.current(e.clientX, e.clientY);
      if (!p) return;
      const picks = st().houseDraw?.picks ?? [];
      const first = picks[0];
      if (first && picks.length >= 3 && Math.hypot(p.world[0] - first.x, p.world[1] - first.y) < CLOSE_M) st().finishHouseDraw();
      else st().addHouseCorner({ x: p.world[0], y: p.world[1] });
    };
    const onLeave = () => setHover(undefined);
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      if (e.key === 'Escape') st().cancelHouseDraw();
      else if (e.key === 'Enter') st().finishHouseDraw();
      else if (e.key === 'Backspace') st().dropHouseCorner();
      else return;
      e.preventDefault();
    };
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
  }, [on, el, pickRef]);

  if (!draw) return null;
  const cursor = hover && { x: hover.world[0], y: hover.world[1] };
  const chain = cursor ? [...draw.picks, cursor] : draw.picks;
  return (
    <>
      {draw.picks.map((p, i) => (
        <Dot key={i} p={[p.x, p.y, 0]} color={COLOR} size={i === 0 ? 12 : 8} />
      ))}
      <Polyline points={chain} />
      {chain.slice(1).map((b, i) => (
        <EdgeLength key={i} a={chain[i]!} b={b} />
      ))}
      {hover && <Dot p={hover.world} color={hover.snapped ? SNAP_COLOR : FREE_COLOR} size={hover.snapped ? 12 : 7} />}
    </>
  );
}

function Polyline({ points }: { points: Vec2[] }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const pairs = points.slice(1).flatMap((b, i) => [...toScene(points[i]!.x, points[i]!.y, 0), ...toScene(b.x, b.y, 0)]);
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pairs), 3));
    return g;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (points.length < 2) return null;
  return (
    <lineSegments geometry={geometry} renderOrder={10}>
      <lineBasicMaterial color={COLOR} depthTest={false} />
    </lineSegments>
  );
}

function EdgeLength({ a, b }: { a: Vec2; b: Vec2 }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.01) return null;
  return (
    <Html position={toScene((a.x + b.x) / 2, (a.y + b.y) / 2, 0)} calculatePosition={designHtmlPosition} style={{ pointerEvents: 'none' }}>
      <div className="edge-length">{len.toFixed(3)} m</div>
    </Html>
  );
}

/** Prompt over the design half while drawing. */
export function HouseDrawReadout() {
  const draw = useProject((s) => s.houseDraw);
  const name = useProject((s) => (draw?.redraw === undefined ? undefined : s.house.blocks[draw.redraw]?.name));
  if (!draw) return null;
  return (
    <div className="measure-readout draw-readout">
      <div>
        <strong>{name ? t.house.redrawing(name) : t.house.drawing}</strong> · {t.house.corners(draw.picks.length)}
      </div>
      <div className="muted">{t.house.drawHint}</div>
    </div>
  );
}
