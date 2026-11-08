import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { ChevronDown, Eye, Focus, X } from 'lucide-react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Box3, MathUtils, OrthographicCamera as OrthographicCameraImpl, PerspectiveCamera as PerspectiveCameraImpl, Vector3, type DirectionalLight as DirectionalLightImpl } from 'three';
import { layerVisible } from '../project/layerGroups';
import { useProject } from '../state/store';
import { useDrawnSheets, type DrawnSheet } from '../state/drawn';
import { sheetBox } from './coords';
import { loadView, storeView, type SavedView, type Side } from './savedView';
import { SheetObject } from './SheetObject';
import { SheetTexts } from './SheetTexts';
import { PdfObject } from './PdfObject';
import { AlignTool } from './AlignTool';
import { LevelMarkers } from './LevelMarkers';
import { TerrainMesh } from './TerrainMesh';
import { HouseMesh } from './HouseMesh';
import { WallMesh } from './WallMesh';
import { HouseDrawReadout, HouseDrawTool } from './HouseDrawTool';
import { MeasureReadout, MeasureTool } from './MeasureTool';
import { EditTool } from './EditTool';
import { KeyPan } from './KeyPan';
import { ENV_LAYER, HORIZON, inBothViewports, splitEvents, useSplitRender, type Half } from './split';
import { drawnLayout, useUi } from '../state/ui';
import { useEnvSurface, useVersions } from '../state/versions';
import type { SheetRow } from '../state/store';
import type { PdfRender } from '../pdf/render';
import { t } from '../ui/strings';

/** PDF sheets just under the lines (default z −0.02), through their transform (identity until aligned, PLAN.md §5 M1c). */
const PDF_Z = -0.02;

function PdfSheets() {
  const sheets = useProject((s) => s.sheets);
  const pdfs = useProject((s) => s.pdfs);
  return sheets.map((s) => {
    const p = pdfs[s.file];
    return s.kind === 'pdf' && p?.status === 'done' && <PdfSheet key={s.file} row={s} render={p.render} />;
  });
}

function PdfSheet({ row, render }: { row: SheetRow; render: PdfRender }) {
  const opacity = useProject((s) => s.pdfOpacity[row.file] ?? 1);
  const z = row.placement?.type === 'horizontal' ? row.placement.z : PDF_Z;
  const { transform } = row;
  // Stable while z and the stored transform don't change, so the quad isn't rebuilt on every render.
  const placement = useMemo(() => ({ type: 'horizontal' as const, z, ...(transform && { transform }) }), [z, transform]);
  return opacity > 0 && <PdfObject render={render} placement={placement} opacity={opacity} />;
}

type Controls = ComponentRef<typeof CameraControls>;
type Vec3 = [number, number, number];

const DEFAULT_DIR = new Vector3(20, 18, 20).normalize().toArray() as Vec3;
/** The ortho camera sits this far from its target; well inside its far plane. */
const TOP_ALTITUDE = 500;

/** Orthographic views: from above, or level from one side. */
type Ortho = 'top' | Side;
/**
 * [azimuth, polar] in camera-controls terms: azimuth 0 = camera on scene +z = world south (coords.ts),
 * +π/2 = scene +x = east; polar 0 = straight down, π/2 = level.
 */
const ORTHO_ANGLES: Record<Ortho, [number, number]> = {
  top: [0, 0],
  south: [0, Math.PI / 2],
  east: [Math.PI / 2, Math.PI / 2],
  north: [Math.PI, Math.PI / 2],
  west: [-Math.PI / 2, Math.PI / 2],
};
const ORTHO_BUTTONS: [Ortho, string, string][] = [
  ['top', t.viewTop, t.viewShort.top],
  ['north', t.viewNorth, t.viewShort.north],
  ['east', t.viewEast, t.viewShort.east],
  ['south', t.viewSouth, t.viewShort.south],
  ['west', t.viewWest, t.viewShort.west],
];
const savedOrtho = (v?: SavedView): Ortho | null => (v?.top ? (v.side ?? 'top') : null);

/** Unit offset target → camera for an ortho view. */
function orthoOffset(o: Ortho): Vector3 {
  const [az, polar] = ORTHO_ANGLES[o];
  return new Vector3(Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar));
}

/** Rotation limits: top keeps polar 0 (azimuth free, as before); side views are locked level on their side. */
function orthoLimits(o: Ortho | null) {
  if (!o) return { minPolarAngle: 0, maxPolarAngle: Math.PI, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity };
  if (o === 'top') return { minPolarAngle: 0, maxPolarAngle: 0, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity };
  const [az, polar] = ORTHO_ANGLES[o];
  return { minPolarAngle: polar, maxPolarAngle: polar, minAzimuthAngle: az, maxAzimuthAngle: az };
}
const SAVE_DELAY_MS = 500;

export function Viewport() {
  const project = useProject((s) => s.dir?.name);
  // Remount per folder so each folder starts from its own saved view.
  return <Scene key={project ?? ''} project={project} />;
}

function Scene({ project }: { project?: string }) {
  const drawn = useDrawnSheets();
  const groups = useProject((s) => s.groups);
  // The terrain crosses z 0, so the environment's ground grid would cut through it.
  const showTerrain = useProject((s) => s.showTerrain);
  // Read once per folder. With a saved view the plans aren't auto-framed: the user's camera wins.
  const [saved] = useState(() => (project ? loadView(project) : undefined));
  const view = useRef<SavedView | undefined>(saved);
  // Ortho views (no parallax): from above to compare stacked plans, from a side to compare with elevations.
  const [chosen, setOrtho] = useState<Ortho | null>(() => savedOrtho(saved));
  // The 2-point tool works in the top view only; the chosen view comes back when it ends.
  const aligning = useProject((s) => s.align !== undefined);
  const ortho: Ortho | null = aligning ? 'top' : chosen;
  const top = ortho !== null;
  const [fitTick, setFitTick] = useState(0);
  // One canvas under two halves (ADR 0001). The controls listen on the half under the pointer, so pan/zoom maths
  // use that half's size; they switch only while no button is down, so a drag can cross the divider.
  const container = useRef<HTMLDivElement>(null);
  const [designEl, setDesignEl] = useState<HTMLDivElement | null>(null);
  const [envEl, setEnvEl] = useState<HTMLDivElement | null>(null);
  const [half, setHalf] = useState<Half>('design');
  const hover = (h: Half) => (e: { buttons: number }) => e.buttons === 0 && setHalf(h);
  // Ctrl+Space: maximize the viewport under the pointer, or back to both.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      const ui = useUi.getState();
      ui.setLayout(ui.layout === 'both' ? half : 'both');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [half]);
  const layout = useUi(drawnLayout);
  const clean = useUi((s) => s.clean);
  return (
    <div className={`viewport-area layout-${layout}`}>
      {!clean && <ViewOverlay ortho={ortho} aligning={aligning} setOrtho={setOrtho} fit={() => setFitTick((n) => n + 1)} />}
      <div className="viewports" ref={container}>
      <Canvas eventSource={container as RefObject<HTMLElement>} events={splitEvents} shadows>
        {top ? (
          <OrthographicCamera makeDefault position={[0, TOP_ALTITUDE, 0]} near={0.1} far={5000} />
        ) : (
          <PerspectiveCamera makeDefault position={[20, 18, 20]} fov={45} near={0.1} far={2000} />
        )}
        <SplitRender />
        <color attach="background" args={['#eef1f4']} />
        <ambientLight intensity={0.6} ref={inBothViewports} />
        <Grid args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />
        {!showTerrain && !clean && <Grid layers={ENV_LAYER} args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />}
        <Sun />
        {/* Weak fill from the north-east, so the faces turned away from the sun still read apart. */}
        <directionalLight layers={ENV_LAYER} position={[30, 20, -25]} intensity={0.3} />
        <CleanFog />
        <OrbitOnDoubleClick>
          <TerrainMesh />
          <WallMesh />
          <HouseMesh />
        </OrbitOnDoubleClick>
        <axesHelper args={[2]} />
        <PdfSheets />
        {drawn.map((d) => {
          const visible = (layer: string) => layerVisible(groups, d.layers, layer);
          return (
            <group key={d.file}>
              <SheetObject sheet={d.sheet} placement={d.placement} color={d.color} visible={visible} />
              <SheetTexts texts={d.sheet.texts} placement={d.placement} color={d.color} visible={visible} />
            </group>
          );
        })}
        <LevelMarkers drawn={drawn} />
        <AlignTool drawn={drawn} />
        <MeasureTool drawn={drawn} />
        <HouseDrawTool drawn={drawn} />
        <EditTool />
        {/* infinityDolly: zooming in past minDistance pushes the target on, so the camera can enter the house (M5b). */}
        <CameraControls
          makeDefault
          domElement={(layout === 'env' || (layout === 'both' && half === 'env') ? envEl : designEl) ?? undefined}
          {...orthoLimits(ortho)}
          infinityDolly
          minDistance={MIN_DOLLY}
        />
        <KeyPan />
        <CameraSync view={view} ortho={ortho} project={project} />
        <FrameOnSheets sheets={drawn} ortho={ortho} auto={!saved} tick={fitTick} />
      </Canvas>
      <div className="vp-half vp-design" ref={setDesignEl} onPointerEnter={hover('design')} onPointerMove={hover('design')}>
        <MeasureReadout />
        <HouseDrawReadout />
      </div>
      <div className="vp-half vp-env" ref={setEnvEl} onPointerEnter={hover('env')} onPointerMove={hover('env')} />
      </div>
      {!clean && <Captions active={half} />}
    </div>
  );
}

/** Viewport captions with a close button. Outside the canvas event container, so clicks don't reach the controls. */
function Captions({ active }: { active: Half }) {
  const layout = useUi((s) => s.layout);
  const setLayout = useUi((s) => s.setLayout);
  const halves: Half[] = layout === 'both' ? ['design', 'env'] : [layout];
  return (
    <div className="vp-captions">
      {halves.map((h) => (
        <span key={h} className={`vp-caption vp-caption-${h}${layout === 'both' && active === h ? ' hot' : ''}`}>
          {t.viewports[h]}
          <button type="button" title={t.shell.closeViewport} disabled={layout !== 'both'} onClick={() => setLayout(h === 'design' ? 'env' : 'design')}>
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** Top-right overlay: camera views, Dopasuj, and the Pokaż menu. Acts on the shared camera (both viewports). */
function ViewOverlay({ ortho, aligning, setOrtho, fit }: { ortho: Ortho | null; aligning: boolean; setOrtho: (o: Ortho | null) => void; fit: () => void }) {
  return (
    <div className="view-overlay">
      <div className="seg">
        <button type="button" aria-pressed={ortho === null} disabled={aligning} title={t.view3d} onClick={() => setOrtho(null)}>
          3D
        </button>
        {ORTHO_BUTTONS.map(([o, label, short]) => (
          <button key={o} type="button" aria-pressed={ortho === o} disabled={aligning} title={label} onClick={() => setOrtho(o)}>
            {short}
          </button>
        ))}
      </div>
      <button type="button" className="tb icon" title={t.fitView} onClick={fit}>
        <Focus size={16} />
      </button>
      <ShowMenu />
    </div>
  );
}

function ShowMenu() {
  const p = useProject();
  const { showDiff, setShowDiff } = useVersions();
  const hasVersion = useVersions((s) => s.active !== 'preview');
  const ref = useRef<HTMLDetailsElement>(null);
  // Closes on a press anywhere outside the menu (also in the viewports) or on Esc.
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (el?.open && !(e instanceof PointerEvent && el.contains(e.target as Node))) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(e);
    window.addEventListener('pointerdown', close, { capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, { capture: true });
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const item = (label: string, title: string, on: boolean, set: (v: boolean) => void) => (
    <label title={title}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );
  return (
    <details className="menu" ref={ref}>
      <summary className="tb">
        <Eye size={16} /> {t.shell.show} <ChevronDown size={14} />
      </summary>
      <div className="menu-body">
        {item(t.levelMarkers, t.levelMarkersTitle, p.showLevels, p.setShowLevels)}
        {item(t.terrainToggle, t.terrainToggleTitle, p.showTerrain, p.setShowTerrain)}
        {item(t.house.toggle, t.house.toggleTitle, p.showHouse, p.setShowHouse)}
        {item(t.house.openingsToggle, t.house.openingsToggleTitle, p.showOpenings, p.setShowOpenings)}
        {hasVersion && item(t.versions.diff, t.versions.diffTitle, showDiff, setShowDiff)}
      </div>
    </details>
  );
}

/**
 * The sun (Environment). In the clean view it casts shadows: the shadow camera covers the terrain (or 60 m around the
 * origin) and sees the Environment layer (shadow cameras default to layer 0, where Environment meshes aren't).
 */
function Sun() {
  const clean = useUi((s) => s.clean);
  const { grid } = useEnvSurface();
  const light = useRef<DirectionalLightImpl>(null);
  const box = useMemo(() => {
    if (!grid) return { cx: 0, cz: 0, r: 60 };
    const w = grid.cols * grid.cell;
    const h = grid.rows * grid.cell;
    return { cx: grid.origin.x + w / 2, cz: -(grid.origin.y + h / 2), r: Math.max(w, h) / 2 + 5 };
  }, [grid]);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(box.cx, 0, box.cz);
    l.target.updateMatrixWorld();
    const c = l.shadow.camera;
    c.layers.set(ENV_LAYER);
    c.left = -box.r;
    c.right = box.r;
    c.top = box.r;
    c.bottom = -box.r;
    c.near = 1;
    c.far = 400;
    c.updateProjectionMatrix();
  }, [box]);
  return (
    <directionalLight
      ref={light}
      layers={ENV_LAYER}
      position={[box.cx - 25 * SUN_SCALE, 40 * SUN_SCALE, box.cz + 30 * SUN_SCALE]}
      intensity={clean ? 1.6 : 1}
      castShadow={clean}
      shadow-mapSize={[4096, 4096]}
      // Against shadow acne (flickering stripes) on sloped, double-sided faces such as the roof: offset the lookup
      // along the normal (m) more than in depth.
      shadow-bias={-0.0002}
      shadow-normalBias={0.06}
    />
  );
}
/** The sun stands this many times its old offset (−25, 40, 30) from the terrain centre, outside any plot. */
const SUN_SCALE = 3;

/** Clean view, perspective camera: haze towards the horizon colour of the sky. (Ortho views sit 500 m away: no fog.) */
function CleanFog() {
  const clean = useUi((s) => s.clean);
  const perspective = useThree((s) => s.camera instanceof PerspectiveCameraImpl);
  return clean && perspective ? <fog attach="fog" args={[HORIZON, 120, 600]} /> : null;
}

/** Perspective camera: closest approach to the target (m) before zooming pushes the target on. */
const MIN_DOLLY = 1;

/**
 * Double-click on a surface (terrain, house) orbits around that point from then on (M5b): with it the camera can be
 * aimed at a room and zoomed into it. The first mesh hit counts, not the edge lines (they pick within a metre).
 */
function OrbitOnDoubleClick({ children }: { children: ReactNode }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  return (
    <group
      onDoubleClick={(e) => {
        const hit = e.intersections.find((i) => (i.object as { isMesh?: boolean }).isMesh);
        if (!hit || !controls) return;
        e.stopPropagation();
        controls.setOrbitPoint(hit.point.x, hit.point.y, hit.point.z);
      }}
    >
      {children}
    </group>
  );
}

function SplitRender() {
  useSplitRender();
  return null;
}

const isOrtho = (c: Controls) => c.camera instanceof OrthographicCameraImpl;

/** Visible world height (m) and look direction of the controls' camera. */
function readView(c: Controls, prevDir: Vec3, ortho: Ortho | null): SavedView {
  const target = c.getTarget(new Vector3());
  const cam = c.camera;
  if (cam instanceof OrthographicCameraImpl) {
    const height = (cam.top - cam.bottom) / cam.zoom;
    const side = ortho && ortho !== 'top' ? ortho : undefined;
    return { top: true, side, target: target.toArray(), height, dir: prevDir };
  }
  const offset = c.getPosition(new Vector3()).sub(target);
  const height = 2 * offset.length() * Math.tan(MathUtils.degToRad(cam.fov) / 2);
  return { top: false, target: target.toArray(), height, dir: offset.normalize().toArray() };
}

/** Puts the controls' camera on the view's target at the view's scale (works across camera types and ortho views). */
function applyView(c: Controls, v: SavedView, ortho: Ortho | null) {
  const [tx, ty, tz] = v.target;
  const cam = c.camera;
  if (cam instanceof OrthographicCameraImpl) {
    const o = orthoOffset(ortho ?? 'top').multiplyScalar(TOP_ALTITUDE);
    void c.setLookAt(tx + o.x, ty + o.y, tz + o.z, tx, ty, tz, false);
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
function CameraSync({ view, ortho, project }: { view: RefObject<SavedView | undefined>; ortho: Ortho | null; project?: string }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  useEffect(() => {
    // Until the new camera's controls arrive, `controls` may still be the old camera's.
    if (!controls || isOrtho(controls) !== (ortho !== null)) return;
    if (view.current) applyView(controls, view.current, ortho);
    else if (ortho) void controls.rotateTo(...ORTHO_ANGLES[ortho], false);
  }, [controls, ortho, view]);

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
      view.current = readView(controls, view.current?.dir ?? DEFAULT_DIR, ortho);
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, SAVE_DELAY_MS);
    };
    controls.addEventListener('update', onUpdate);
    return () => {
      controls.removeEventListener('update', onUpdate);
      flush();
    };
  }, [controls, ortho, project, view]);
  return null;
}

/**
 * Frames the camera on the building (drawn sheets other than site sheets): automatically when the set of sheets (or their placement) changes and
 * there was no saved view, and whenever "Dopasuj widok" is clicked. Switching cameras doesn't re-frame.
 */
function FrameOnSheets({ sheets, ortho, auto, tick }: { sheets: DrawnSheet[]; ortho: Ortho | null; auto: boolean; tick: number }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  // Compare keys, not the `sheets` array, which is new on every store change (that would fight orbiting).
  const framed = useRef({ key: '', tick: 0 });
  useEffect(() => {
    const key = sheets.map((d) => `${d.file}@${JSON.stringify(d.placement)}`).join('|');
    if (!controls || isOrtho(controls) !== (ortho !== null)) return;
    if (!(auto && key !== framed.current.key) && tick === framed.current.tick) return;
    framed.current = { key, tick };
    // fitToBox snaps the rotation to the nearest 90°, so ortho views stay exact.
    if (ortho) void controls.rotateTo(...ORTHO_ANGLES[ortho], false);
    const box = new Box3();
    // The building (plans, elevations); site sheets reach far beyond it. Site-only projects frame the site.
    const building = sheets.filter((d) => d.kind !== 'site');
    for (const d of building.length ? building : sheets) if (d.sheet.extents) box.union(sheetBox(d.sheet.extents, d.placement));
    if (!box.isEmpty()) void controls.fitToBox(box, true, { paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1 });
  }, [controls, sheets, ortho, auto, tick]);
  return null;
}
