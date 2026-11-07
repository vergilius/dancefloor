import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Box3 } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { layerVisible, type LayerOverrides } from '../project/layerGroups';
import { useProject } from '../state/store';
import { planBox } from './coords';
import { SheetObject } from './SheetObject';
import { SheetTexts } from './SheetTexts';
import { t } from '../ui/strings';

// One colour per stacked plan, in sheet order, so the levels are easy to tell apart.
const PLAN_COLORS = ['#1f6feb', '#d1242f', '#1a7f37', '#8250df', '#bf8700'];

type DrawnPlan = { file: string; z: number; sheet: NormalizedSheet; layers?: LayerOverrides };

function useDrawnPlans(): DrawnPlan[] {
  const sheets = useProject((s) => s.sheets);
  const parsed = useProject((s) => s.parsed);
  return sheets.flatMap((s) => {
    const p = parsed[s.file];
    return s.kind === 'plan' && s.placement && p?.status === 'done'
      ? [{ file: s.file, z: s.placement.z, sheet: p.summary.sheet, layers: s.layers }]
      : [];
  });
}

export function Viewport() {
  const plans = useDrawnPlans();
  const groups = useProject((s) => s.groups);
  // Top view = orthographic camera looking straight down, so stacked plans can be compared without parallax.
  const [top, setTop] = useState(false);
  return (
    <>
      <button type="button" className="view-toggle" onClick={() => setTop((v) => !v)}>
        {top ? t.view3d : t.viewTop}
      </button>
      <Canvas>
        {top ? (
          <OrthographicCamera makeDefault position={[0, 500, 0]} near={0.1} far={5000} />
        ) : (
          <PerspectiveCamera makeDefault position={[20, 18, 20]} fov={45} near={0.1} far={2000} />
        )}
        <color attach="background" args={['#eef1f4']} />
        <ambientLight intensity={0.8} />
        <Grid args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />
        <axesHelper args={[2]} />
        {plans.map((p, i) => {
          const color = PLAN_COLORS[i % PLAN_COLORS.length]!;
          const visible = (layer: string) => layerVisible(groups, p.layers, layer);
          return (
            <group key={p.file}>
              <SheetObject sheet={p.sheet} z={p.z} color={color} visible={visible} />
              <SheetTexts texts={p.sheet.texts} z={p.z} color={color} visible={visible} />
            </group>
          );
        })}
        {/* Polar angle 0 = looking straight down; locked in top view. */}
        <CameraControls makeDefault maxPolarAngle={top ? 0 : Math.PI} />
        <FrameOnPlans plans={plans} top={top} />
      </Canvas>
    </>
  );
}

/** Re-frames the camera whenever the set of drawn plans (or their z) changes. */
function FrameOnPlans({ plans, top }: { plans: DrawnPlan[]; top: boolean }) {
  const controls = useThree((s) => s.controls) as ComponentRef<typeof CameraControls> | null;
  // Only re-frame when files/z change, not on every new `plans` array (that would fight the user's orbiting).
  // Switching cameras recreates the controls, so remember which controls were framed too.
  const framed = useRef<{ controls: unknown; key: string }>({ controls: null, key: '' });
  useEffect(() => {
    const key = plans.map((p) => `${p.file}@${p.z}`).join('|');
    if (!controls || (controls === framed.current.controls && key === framed.current.key)) return;
    framed.current = { controls, key };
    // fitToBox snaps the rotation to the nearest 90°, so polar 0 stays a top view.
    if (top) void controls.rotateTo(0, 0, false);
    const box = new Box3();
    for (const p of plans) if (p.sheet.extents) box.union(planBox(p.sheet.extents, p.z));
    if (!box.isEmpty()) void controls.fitToBox(box, true, { paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1 });
  }, [controls, plans, top]);
  return null;
}
