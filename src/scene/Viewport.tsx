import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Box3, MathUtils, OrthographicCamera as OrthographicCameraImpl, Vector3 } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { layerVisible, type LayerOverrides } from '../project/layerGroups';
import type { SheetKind } from '../project/projectFile';
import { useProject } from '../state/store';
import { deriveSite } from '../state/site';
import { deriveVertical, isVertical, placementFor, useReference } from '../state/vertical';
import { sheetBox, type SheetPlacement } from './coords';
import { loadView, storeView, type SavedView, type Side } from './savedView';
import { SheetObject } from './SheetObject';
import { SheetTexts } from './SheetTexts';
import { PdfObject } from './PdfObject';
import { AlignTool } from './AlignTool';
import { LevelMarkers } from './LevelMarkers';
import { ENV_LAYER, inBothViewports, splitEvents, useSplitRender, type Half } from './split';
import type { SheetRow } from '../state/store';
import type { PdfRender } from '../pdf/render';
import { t } from '../ui/strings';

// One colour per stacked plan, in sheet order, so the levels are easy to tell apart. Vertical sheets get their own set.
const PLAN_COLORS = ['#1f6feb', '#d1242f', '#1a7f37', '#8250df', '#bf8700'];
const VERTICAL_COLORS = ['#57606a', '#bc4c00', '#0a7480', '#953800', '#6e40c9', '#4d2d00', '#116329'];
const SITE_COLORS = ['#6e7781', '#a40e26'];

type DrawnSheet = { file: string; kind: SheetKind; placement: SheetPlacement; sheet: NormalizedSheet; layers?: LayerOverrides; color: string };

/**
 * Plans at their z, vertical sheets that were placed (flagged ones aren't drawn, PLAN.md §5 M1b), and site sheets
 * at z 0 through their saved or automatic alignment (identity if neither, PLAN.md §5 M1c).
 */
function useDrawnSheets(): DrawnSheet[] {
  const sheets = useProject((s) => s.sheets);
  const parsed = useProject((s) => s.parsed);
  const ref = useReference();
  let plans = 0;
  let verticals = 0;
  let sites = 0;
  return sheets.flatMap((s): DrawnSheet[] => {
    const p = parsed[s.file];
    if (p?.status !== 'done') return [];
    const base = { file: s.file, kind: s.kind, sheet: p.summary.sheet, layers: s.layers };
    if (s.kind === 'plan' && s.placement?.type === 'horizontal')
      return [{ ...base, placement: s.placement, color: PLAN_COLORS[plans++ % PLAN_COLORS.length]! }];
    if (isVertical(s.kind) && ref) {
      const placement = placementFor(s, deriveVertical(s.file, s.kind, p.summary.sheet, ref));
      if (placement) return [{ ...base, placement, color: VERTICAL_COLORS[verticals++ % VERTICAL_COLORS.length]! }];
    }
    if (s.kind === 'site') {
      // A saved transform wins; otherwise the automatic one.
      const a = !s.transform && ref ? deriveSite(p.summary.sheet, ref) : undefined;
      const transform = s.transform ?? (a?.ok ? a.transform : undefined);
      const z = s.placement?.type === 'horizontal' ? s.placement.z : 0;
      const placement = { type: 'horizontal' as const, z, ...(transform && { transform }) };
      return [{ ...base, placement, color: SITE_COLORS[sites++ % SITE_COLORS.length]! }];
    }
    return [];
  });
}

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
const ORTHO_BUTTONS: [Ortho, string][] = [
  ['top', t.viewTop],
  ['north', t.viewNorth],
  ['east', t.viewEast],
  ['south', t.viewSouth],
  ['west', t.viewWest],
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
  return (
    <>
      <div className="view-bar">
        <button type="button" onClick={() => setFitTick((n) => n + 1)}>
          {t.fitView}
        </button>
        <button type="button" aria-pressed={!top} disabled={aligning} onClick={() => setOrtho(null)}>
          {t.view3d}
        </button>
        {ORTHO_BUTTONS.map(([o, label]) => (
          <button key={o} type="button" aria-pressed={ortho === o} disabled={aligning} onClick={() => setOrtho(o)}>
            {label}
          </button>
        ))}
        <LevelsToggle />
        <AlignPrompt />
      </div>
      <div className="viewports" ref={container}>
      <Canvas eventSource={container as RefObject<HTMLElement>} events={splitEvents}>
        {top ? (
          <OrthographicCamera makeDefault position={[0, TOP_ALTITUDE, 0]} near={0.1} far={5000} />
        ) : (
          <PerspectiveCamera makeDefault position={[20, 18, 20]} fov={45} near={0.1} far={2000} />
        )}
        <SplitRender />
        <color attach="background" args={['#eef1f4']} />
        <ambientLight intensity={0.8} ref={inBothViewports} />
        <Grid args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />
        <Grid layers={ENV_LAYER} args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />
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
        <CameraControls makeDefault domElement={(half === 'env' ? envEl : designEl) ?? undefined} {...orthoLimits(ortho)} />
        <CameraSync view={view} ortho={ortho} project={project} />
        <FrameOnSheets sheets={drawn} ortho={ortho} auto={!saved} tick={fitTick} />
      </Canvas>
      <div className="vp-half vp-design" ref={setDesignEl} onPointerEnter={hover('design')} onPointerMove={hover('design')}>
        <span className="vp-caption">{t.viewports.design}</span>
      </div>
      <div className="vp-half vp-env" ref={setEnvEl} onPointerEnter={hover('env')} onPointerMove={hover('env')}>
        <span className="vp-caption">{t.viewports.env}</span>
      </div>
      </div>
    </>
  );
}

function SplitRender() {
  useSplitRender();
  return null;
}

function LevelsToggle() {
  const show = useProject((s) => s.showLevels);
  const setShowLevels = useProject((s) => s.setShowLevels);
  return (
    <button type="button" aria-pressed={show} title={t.levelMarkersTitle} onClick={() => setShowLevels(!show)}>
      {t.levelMarkers}
    </button>
  );
}

/** What the 2-point tool wants clicked next. */
function AlignPrompt() {
  const align = useProject((s) => s.align);
  const cancelAlign = useProject((s) => s.cancelAlign);
  const ref = useReference();
  if (!align) return null;
  const n = align.picks.length;
  const step = t.align.steps[n];
  return (
    <span className="align-prompt">
      <span className="muted">{t.align.stepOf(n + 1)}</span> <strong>{step?.(sheetName(align.file), ref ? sheetName(ref.file) : t.align.referenceFallback)}</strong> ·{' '}
      {t.align.escHint}{' '}
      <button type="button" onClick={cancelAlign}>
        {t.align.cancel}
      </button>
    </span>
  );
}

/** Short sheet name for prompts: "PAB-01 - RZUT PARTERU.dwg" → "PAB-01", others without the extension. */
const sheetName = (file: string) => file.replace(/\.(dwg|pdf)$/i, '').split(' - ')[0]!;

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
