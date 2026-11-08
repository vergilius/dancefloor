// 2-point tool (PLAN.md §5 M1c), top view only: A on the reference → A′ on the sheet (shifts it there) → B → B′.
import { useEffect, useMemo, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { designHtmlPosition } from './split';
import { OrthographicCamera } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { apply, IDENTITY, invert, type Similarity2D, type Vec2 } from '../project/align';
import { layerVisible, type LayerOverrides } from '../project/layerGroups';
import { useProject } from '../state/store';
import { t } from '../ui/strings';
import { toScene, type SheetPlacement } from './coords';
import { CLICK_PX, endpoints, nearest, SNAP_PX, type Endpoints } from './snap';
import { Dot } from './Dot';
const PLANE_SIZE = 5000;
const MARKER_Z = 0.05;
const COLORS = { source: '#0969da', target: '#cf222e', snapped: '#1a7f37', free: '#6e7781' };

type Drawn = { file: string; placement: SheetPlacement; sheet: NormalizedSheet; layers?: LayerOverrides };
/** World point under the cursor; `sheet` set on sheet steps (A′, B′: the point in the aligned sheet's own coords). */
type Pick = { world: Vec2; sheet?: Vec2; snapped: boolean };

export function AlignTool({ drawn }: { drawn: Drawn[] }) {
  const align = useProject((s) => s.align);
  const sheets = useProject((s) => s.sheets);
  const groups = useProject((s) => s.groups);
  const pickAlign = useProject((s) => s.pickAlign);
  const cancelAlign = useProject((s) => s.cancelAlign);
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height);
  const [hover, setHover] = useState<Pick>();
  const file = align?.file;

  // The aligned sheet's current transform (saved, auto or identity); it doesn't change while the tool runs.
  const source = drawn.find((d) => d.file === file);
  const row = sheets.find((r) => r.file === file);
  const current: Similarity2D =
    (source?.placement.type === 'horizontal' ? source.placement.transform : row?.transform) ?? IDENTITY;

  // Source: the sheet's own endpoints (DWG); none for a PDF, so its clicks are free. Target: the other horizontal sheets.
  const snaps = useMemo(() => {
    const ends = (d: Drawn): Endpoints | [] =>
      d.placement.type === 'horizontal' ? endpoints(d.sheet, d.placement, (l) => layerVisible(groups, d.layers, l)) : [];
    const src = drawn.filter((d) => d.file === file).flatMap(ends);
    const dst = drawn.filter((d) => d.file !== file).flatMap(ends);
    return { source: src[0], target: concat(dst.map((e) => e.world)) };
  }, [drawn, file, groups]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelAlign();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, cancelAlign]);

  if (!align) return null;
  // A, B on the reference; A′, B′ on the sheet being aligned.
  const sourceStep = align.picks.length % 2 === 1;

  const pickAt = (e: ThreeEvent<PointerEvent | MouseEvent>): Pick => {
    const p = { x: e.point.x, y: -e.point.z };
    const r = camera instanceof OrthographicCamera ? (SNAP_PX * (camera.top - camera.bottom)) / camera.zoom / height : 0;
    if (sourceStep) {
      const pts = snaps.source;
      const i = pts ? nearest(pts.world, p, r) : -1;
      if (pts && i >= 0)
        return { world: { x: pts.world[2 * i]!, y: pts.world[2 * i + 1]! }, sheet: { x: pts.sheet[2 * i]!, y: pts.sheet[2 * i + 1]! }, snapped: true };
      return { world: p, sheet: apply(invert(current), p), snapped: false };
    }
    const i = nearest(snaps.target, p, r);
    if (i >= 0) return { world: { x: snaps.target[2 * i]!, y: snaps.target[2 * i + 1]! }, snapped: true };
    return { world: p, snapped: false };
  };

  // Picks so far, in world coords: A and B as picked, A′ and B′ through the sheet's current transform.
  const placed = align.picks.map((p, i) => ({ world: i % 2 === 1 ? apply(current, p) : p, color: i % 2 === 1 ? COLORS.source : COLORS.target }));

  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        onPointerMove={(e) => setHover(pickAt(e))}
        onPointerOut={() => setHover(undefined)}
        onClick={(e) => {
          if (e.delta > CLICK_PX) return;
          const p = pickAt(e);
          pickAlign(sourceStep ? p.sheet! : p.world, current);
          setHover(undefined);
        }}
      >
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {placed.map((m, i) => (
        <Dot key={i} p={[m.world.x, m.world.y, MARKER_Z]} color={m.color} size={10} />
      ))}
      {hover && (
        <>
          <Dot p={[hover.world.x, hover.world.y, MARKER_Z]} color={hover.snapped ? COLORS.snapped : COLORS.free} size={hover.snapped ? 12 : 7} />
          {/* Which point this click places; snapping status unless the source has nothing to snap to (PDF). */}
          <Html position={toScene(hover.world.x, hover.world.y, MARKER_Z)} calculatePosition={designHtmlPosition} style={{ pointerEvents: 'none' }}>
            <div className="align-cursor" style={{ borderColor: sourceStep ? COLORS.source : COLORS.target }}>
              <strong>{t.align.labels[align.picks.length]}</strong>
              {(!sourceStep || snaps.source) && <> · {hover.snapped ? t.align.snapped : t.align.free}</>}
            </div>
          </Html>
        </>
      )}
    </>
  );
}

function concat(parts: Float64Array[]): Float64Array {
  const out = new Float64Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
