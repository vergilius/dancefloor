import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Box3, MathUtils, OrthographicCamera as OrthographicCameraImpl, Vector3 } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { layerVisible, type LayerOverrides } from '../project/layerGroups';
import { useProject } from '../state/store';
import { deriveVertical, isVertical, useReference } from '../state/vertical';
import { sheetBox, type SheetPlacement } from './coords';
import { loadView, storeView, type SavedView } from './savedView';
import { SheetObject } from './SheetObject';
import { SheetTexts } from './SheetTexts';
import { t } from '../ui/strings';

// One colour per stacked plan, in sheet order, so the levels are easy to tell apart. Vertical sheets get their own set.
const PLAN_COLORS = ['#1f6feb', '#d1242f', '#1a7f37', '#8250df', '#bf8700'];
const VERTICAL_COLORS = ['#57606a', '#bc4c00', '#0a7480', '#953800', '#6e40c9', '#4d2d00', '#116329'];

type DrawnSheet = { file: string; placement: SheetPlacement; sheet: NormalizedSheet; layers?: LayerOverrides; color: string };

/** Plans at their z, plus vertical sheets that were placed (flagged ones aren't drawn, PLAN.md §5 M1b). */
function useDrawnSheets(): DrawnSheet[] {
  const sheets = useProject((s) => s.sheets);
  const parsed = useProject((s) => s.parsed);
  const ref = useReference();
  let plans = 0;
  let verticals = 0;
  return sheets.flatMap((s): DrawnSheet[] => {
    const p = parsed[s.file];
    if (p?.status !== 'done') return [];
    const base = { file: s.file, sheet: p.summary.sheet, layers: s.layers };
    if (s.kind === 'plan' && s.placement)
      return [{ ...base, placement: s.placement, color: PLAN_COLORS[plans++ % PLAN_COLORS.length]! }];
    if (isVertical(s.kind) && ref) {
      const placement = deriveVertical(s.file, s.kind, p.summary.sheet, ref).placement;
      if (placement) return [{ ...base, placement, color: VERTICAL_COLORS[verticals++ % VERTICAL_COLORS.length]! }];
    }
    return [];
  });
}

type Controls = ComponentRef<typeof CameraControls>;
type Vec3 = [number, number, number];

const DEFAULT_DIR = new Vector3(20, 18, 20).normalize().toArray() as Vec3;
/** The top (ortho) camera sits this far above its target; well inside its far plane. */
const TOP_ALTITUDE = 500;
const SAVE_DELAY_MS = 500;

export function Viewport() {
  const project = useProject((s) => s.dir?.name);
  // Remount per folder so each folder starts from its own saved view.
  return <Scene key={project ?? ''} project={project} />;
}

function Scene({ project }: { project?: string }) {
  const drawn = useDrawnSheets();
  const groups = useProject((s) => s.groups);
  // Read once per folder. With a saved view the plans aren't auto-framed: the user's camera wins.
  const [saved] = useState(() => (project ? loadView(project) : undefined));
  const view = useRef<SavedView | undefined>(saved);
  // Top view = orthographic camera looking straight down, so stacked plans can be compared without parallax.
  const [top, setTop] = useState(saved?.top ?? false);
  const [fitTick, setFitTick] = useState(0);
  return (
    <>
      <div className="view-bar">
        <button type="button" onClick={() => setFitTick((n) => n + 1)}>
          {t.fitView}
        </button>
        <button type="button" onClick={() => setTop((v) => !v)}>
          {top ? t.view3d : t.viewTop}
        </button>
      </div>
      <Canvas>
        {top ? (
          <OrthographicCamera makeDefault position={[0, TOP_ALTITUDE, 0]} near={0.1} far={5000} />
        ) : (
          <PerspectiveCamera makeDefault position={[20, 18, 20]} fov={45} near={0.1} far={2000} />
        )}
        <color attach="background" args={['#eef1f4']} />
        <ambientLight intensity={0.8} />
        <Grid args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />
        <axesHelper args={[2]} />
        {drawn.map((d) => {
          const visible = (layer: string) => layerVisible(groups, d.layers, layer);
          return (
            <group key={d.file}>
              <SheetObject sheet={d.sheet} placement={d.placement} color={d.color} visible={visible} />
              <SheetTexts texts={d.sheet.texts} placement={d.placement} color={d.color} visible={visible} />
            </group>
          );
        })}
        {/* Polar angle 0 = looking straight down; locked in top view. */}
        <CameraControls makeDefault maxPolarAngle={top ? 0 : Math.PI} />
        <CameraSync view={view} top={top} project={project} />
        <FrameOnSheets sheets={drawn} top={top} auto={!saved} tick={fitTick} />
      </Canvas>
    </>
  );
}

const isOrtho = (c: Controls) => c.camera instanceof OrthographicCameraImpl;

/** Visible world height (m) and look direction of the controls' camera. */
function readView(c: Controls, prevDir: Vec3): SavedView {
  const target = c.getTarget(new Vector3());
  const cam = c.camera;
  if (cam instanceof OrthographicCameraImpl) {
    return { top: true, target: target.toArray(), height: (cam.top - cam.bottom) / cam.zoom, dir: prevDir };
  }
  const offset = c.getPosition(new Vector3()).sub(target);
  const height = 2 * offset.length() * Math.tan(MathUtils.degToRad(cam.fov) / 2);
  return { top: false, target: target.toArray(), height, dir: offset.normalize().toArray() };
}

/** Puts the controls' camera on the view's target at the view's scale (works across camera types). */
function applyView(c: Controls, v: SavedView) {
  const [tx, ty, tz] = v.target;
  const cam = c.camera;
  if (cam instanceof OrthographicCameraImpl) {
    void c.setLookAt(tx, ty + TOP_ALTITUDE, tz, tx, ty, tz, false);
    void c.zoomTo((cam.top - cam.bottom) / v.height, false);
  } else {
    const d = v.height / (2 * Math.tan(MathUtils.degToRad(cam.fov) / 2));
    const [dx, dy, dz] = v.dir;
    void c.setLookAt(tx + dx * d, ty + dy * d, tz + dz * d, tx, ty, tz, false);
  }
}

/**
 * Keeps `view` in sync with the camera and saves it (debounced) per folder. When the camera type
 * changes, the new controls take over the same target and scale instead of jumping.
 */
function CameraSync({ view, top, project }: { view: RefObject<SavedView | undefined>; top: boolean; project?: string }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  useEffect(() => {
    // Until the new camera's controls arrive, `controls` may still be the old camera's.
    if (!controls || isOrtho(controls) !== top) return;
    if (view.current) applyView(controls, view.current);
    else if (top) void controls.rotateTo(0, 0, false);
  }, [controls, top, view]);

  useEffect(() => {
    if (!controls) return;
    let timer: number | undefined;
    const flush = () => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
      if (project && view.current) storeView(project, view.current);
    };
    const onUpdate = () => {
      view.current = readView(controls, view.current?.dir ?? DEFAULT_DIR);
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, SAVE_DELAY_MS);
    };
    controls.addEventListener('update', onUpdate);
    return () => {
      controls.removeEventListener('update', onUpdate);
      flush();
    };
  }, [controls, project, view]);
  return null;
}

/**
 * Frames the camera on the drawn sheets: automatically when the set of sheets (or their placement) changes and
 * there was no saved view, and whenever "Dopasuj widok" is clicked. Switching cameras doesn't re-frame.
 */
function FrameOnSheets({ sheets, top, auto, tick }: { sheets: DrawnSheet[]; top: boolean; auto: boolean; tick: number }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  // Compare keys, not the `sheets` array, which is new on every store change (that would fight orbiting).
  const framed = useRef({ key: '', tick: 0 });
  useEffect(() => {
    const key = sheets.map((d) => `${d.file}@${JSON.stringify(d.placement)}`).join('|');
    if (!controls || isOrtho(controls) !== top) return;
    if (!(auto && key !== framed.current.key) && tick === framed.current.tick) return;
    framed.current = { key, tick };
    // fitToBox snaps the rotation to the nearest 90°, so polar 0 stays a top view.
    if (top) void controls.rotateTo(0, 0, false);
    const box = new Box3();
    for (const d of sheets) if (d.sheet.extents) box.union(sheetBox(d.sheet.extents, d.placement));
    if (!box.isEmpty()) void controls.fitToBox(box, true, { paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1 });
  }, [controls, sheets, top, auto, tick]);
  return null;
}
