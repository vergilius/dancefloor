// Edit tools in the Environment viewport (PLAN.md §5 M4a, M4b), sim-builder style. With a tool armed in a version, a
// left drag that starts on the terrain draws a rect snapped to the 0.5 m lattice (draped on the surface). Podnieś /
// Obniż commit on release. Wyrównaj then enters its height phase: moving the mouse up / down sets z (1 cm per pixel,
// from the drag's start height) with the slopes previewed live; a click commits, Esc or a right click cancels. A new
// edit is selected; on the selected edit, hovering near an edge outlines it and a click cycles Skarpa → Uskok → Mur.
// A drag that starts off the terrain orbits as usual.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import { useEnvSurface, useVersions, versionSurface } from '../state/versions';
import { isOutside, rayGrid, sampleGrid, type HeightGrid } from '../terrain/grid';
import { DEFAULT_DZ, edgesOf, heightAt, snapRect, type EdgeMode, type Edges, type Edit, type Rect, type Side } from '../versions/edits';
import { ENV_LAYER, halfAt } from './split';

const COLOR = '#0969da';
const SELECTED_COLOR = '#bf8700';
/** The edge under the pointer (in the view or in the edge selects of the list). */
const EDGE_COLOR = '#cf222e';
/** Draped this far above the surface (m), sampled every STEP (m). */
const LIFT = 0.04;
const STEP = 0.1;
/** Wyrównaj's height phase: metres per screen pixel of vertical mouse movement. */
const M_PER_PX = 0.01;
/** Hover distance to an edge of the selected edit (plan m). */
const EDGE_HIT = 0.3;
/** New edits: Skarpa on all 4 edges (the bar's 1:n). */
const NEW_EDGES: Edges = { w: 'slope', e: 'slope', s: 'slope', n: 'slope' };
const NEXT_MODE: Record<EdgeMode, EdgeMode> = { slope: 'step', step: 'wall', wall: 'slope' };

let seq = 0;
const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The side of `r` within EDGE_HIT of plan point p (the nearest), if any. */
function nearSide(r: Rect, [x, y]: [number, number]): Side | undefined {
  const inX = x > r.x0 - EDGE_HIT && x < r.x1 + EDGE_HIT;
  const inY = y > r.y0 - EDGE_HIT && y < r.y1 + EDGE_HIT;
  const cands: [Side, number][] = [];
  if (inY) cands.push(['w', Math.abs(x - r.x0)], ['e', Math.abs(x - r.x1)]);
  if (inX) cands.push(['s', Math.abs(y - r.y0)], ['n', Math.abs(y - r.y1)]);
  const best = cands.filter(([, d]) => d < EDGE_HIT).sort((a, b) => a[1] - b[1])[0];
  return best?.[0];
}

export function EditTool() {
  const { grid, version } = useEnvSurface();
  const draft = useVersions((s) => s.draft);
  const selected = useVersions((s) => version?.edits.find((e) => e.id === s.selected));
  const hoverSide = useVersions((s) => s.hoverSide);
  const camera = useThree((s) => s.camera);
  const el = useThree((s) => s.events.connected) as HTMLElement | undefined;
  // Picking uses the committed surface: the preview (Wyrównaj's height phase) changes `grid` on every mouse move.
  const picked = version && versionSurface(version).grid;
  const on = Boolean(version && picked);

  /** Plan point on the surface under a client point in the Environment half. */
  const pick = (g: HeightGrid, clientX: number, clientY: number): [number, number] | undefined => {
    if (!el) return undefined;
    const { half, ndc } = halfAt(clientX, clientY, el.getBoundingClientRect());
    if (half !== 'env') return undefined;
    raycaster.setFromCamera(new Vector2(...ndc), camera);
    const { origin: o, direction: d } = raycaster.ray;
    // Scene (x, z, −y) → plan (x, y, height), see coords.ts.
    const hit = rayGrid(g, [o.x, -o.z, o.y], [d.x, -d.z, d.y]);
    if (!hit) return undefined;
    // The grid goes on under the hidden part beyond the plot + margin; a hit there doesn't count.
    const i = Math.round((hit[0] - g.origin.x) / g.cell);
    const j = Math.round((hit[1] - g.origin.y) / g.cell);
    return isOutside(g, j * (g.cols + 1) + i) ? undefined : [hit[0], hit[1]];
  };
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    if (!on || !el || !picked) return;
    const grid = picked;
    const st = useVersions.getState;
    const { setDraft, setPreview, addEdit, select, setHoverSide, setEditShape } = st();
    /** The selected edit of the active version (edge hover / click). */
    const selectedEdit = () => {
      const s = st();
      return s.versions.find((v) => v.id === s.active)?.edits.find((e) => e.id === s.selected);
    };
    let phase: 'idle' | 'area' | 'height' = 'idle';
    let start: [number, number] | undefined;
    let rect: Rect | undefined;
    /** Wyrównaj: the start height (1 cm) and the pointer's y when the height phase began. */
    let z0 = 0;
    let y0 = 0;
    let placing: Edit | undefined;
    let frame = 0;
    /** Edge of the selected edit under the pointer (from the view, not from the list). */
    let edge: Side | undefined;

    const setEdge = (side: Side | undefined) => {
      if (side === edge) return;
      edge = side;
      setHoverSide(side);
      el.style.cursor = side ? 'pointer' : '';
    };
    const reset = () => {
      phase = 'idle';
      start = rect = placing = undefined;
      cancelAnimationFrame(frame);
      setDraft(undefined);
      setPreview(undefined);
    };
    const newEdit = (r: Rect): Edit | undefined => {
      const t = st().tool;
      const base = { id: newId(), rect: r, edges: NEW_EDGES, slope: st().newSlope };
      if (t === 'level') return { ...base, tool: t, z: z0 };
      if (t === 'raise' || t === 'lower') return { ...base, tool: t, dz: DEFAULT_DZ };
      return undefined;
    };
    const commit = (e: Edit) => {
      reset();
      addEdit(e);
      select(e.id); // the edge clicks and the bar's 1:n now act on it
    };

    const onMove = (e: PointerEvent) => {
      if (phase === 'area') {
        const p = start && pickRef.current(grid, e.clientX, e.clientY);
        if (!start || !p) return;
        rect = snapRect(start[0], start[1], p[0], p[1]);
        setDraft({ ...rect, z: st().tool === 'level' ? z0 : undefined });
      } else if (phase === 'height') {
        const z = Math.round((z0 + (y0 - e.clientY) * M_PER_PX) * 100) / 100;
        if (!placing || placing.tool !== 'level' || placing.z === z) return;
        placing = { ...placing, z };
        const shown = placing;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          setDraft({ ...shown.rect, z: shown.z });
          setPreview(shown);
        });
      } else {
        const sel = selectedEdit();
        const p = sel && pickRef.current(grid, e.clientX, e.clientY);
        setEdge(sel && p ? nearSide(sel.rect, p) : undefined);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (phase !== 'area') return;
      const r = rect;
      const edit = r && newEdit(r);
      if (!edit) return reset();
      if (edit.tool !== 'level') return commit(edit);
      // Wyrównaj: the height follows the mouse until the next click.
      phase = 'height';
      placing = edit;
      y0 = e.clientY;
      setPreview(edit);
    };
    // Capture phase on the container: a press we handle never reaches the camera controls.
    const onDown = (e: PointerEvent) => {
      if (phase === 'height') {
        e.stopPropagation();
        e.preventDefault();
        if (e.button === 0 && placing) commit(placing);
        else reset();
        return;
      }
      if (e.button !== 0) return;
      const sel = selectedEdit();
      if (sel && edge) {
        e.stopPropagation();
        e.preventDefault();
        const edges = edgesOf(sel);
        setEditShape(sel.id, { edges: { ...edges, [edge]: NEXT_MODE[edges[edge]] } });
        return;
      }
      if (!st().tool) return;
      const p = pickRef.current(grid, e.clientX, e.clientY);
      if (!p) return;
      e.stopPropagation();
      e.preventDefault();
      setEdge(undefined);
      phase = 'area';
      start = p;
      z0 = heightAt(grid, p[0], p[1]);
      rect = snapRect(p[0], p[1], p[0], p[1]);
      setDraft({ ...rect, z: st().tool === 'level' ? z0 : undefined });
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && phase !== 'idle' && reset();
    const onMenu = (e: MouseEvent) => phase === 'height' && e.preventDefault();
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('contextmenu', onMenu);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      setEdge(undefined);
      reset();
    };
    // The tool is read from the store at each event; re-arming a tool must not drop a drag in progress.
  }, [on, el, picked]);

  const line = useMemo(() => on && draft && grid && drapedRect(grid, draft), [on, draft, grid]);
  const sel = useMemo(() => selected && grid && drapedRect(grid, selected.rect), [selected, grid]);
  const edgeLine = useMemo(() => hoverSide && selected && grid && drapedRect(grid, selected.rect, hoverSide), [hoverSide, selected, grid]);
  return (
    <>
      {line && <Outline points={line} color={COLOR} />}
      {sel && <Outline points={sel} color={SELECTED_COLOR} />}
      {edgeLine && <Outline points={edgeLine} color={EDGE_COLOR} />}
    </>
  );
}

function Outline({ points, color }: { points: Float32Array; color: string }) {
  return (
    <lineSegments layers={ENV_LAYER} renderOrder={10} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} depthTest={false} />
    </lineSegments>
  );
}

const raycaster = new Raycaster();

/** Corner index k → k + 1 of the outline below, per side. */
const SIDE_START: Record<Side, number> = { s: 0, e: 1, n: 2, w: 3 };

/** The rect's outline (or one side of it) as scene segments following the surface. */
function drapedRect(g: HeightGrid, r: Rect, side?: Side): Float32Array {
  const out: number[] = [];
  const lift = side ? 2 * LIFT : LIFT;
  const at = (x: number, y: number) => out.push(x, sampleGrid(g, x, y) + lift, -y);
  const corners: [number, number][] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  for (let k = 0; k < 4; k++) {
    if (side && k !== SIDE_START[side]) continue;
    const [x1, y1] = corners[k]!;
    const [x2, y2] = corners[(k + 1) % 4]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / STEP));
    for (let q = 0; q < n; q++) {
      at(x1 + ((x2 - x1) * q) / n, y1 + ((y2 - y1) * q) / n);
      at(x1 + ((x2 - x1) * (q + 1)) / n, y1 + ((y2 - y1) * (q + 1)) / n);
    }
  }
  return Float32Array.from(out);
}
