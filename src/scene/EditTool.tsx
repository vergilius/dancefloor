// Edit tools in the Environment viewport (PLAN.md §5 M4a, M4b), sim-builder style. With a tool armed in a version, a
// left drag that starts on the terrain draws a rect snapped to the 0.5 m lattice and adds the edit on release
// (Wyrównaj flat at the drag's start height, Podnieś / Obniż by dz), selected. On a selected Wyrównaj, a drag inside
// moves it up / down and a drag near an edge moves only that edge (a ramp), 1 cm per pixel, previewed live, one undo
// step per drag. A click near an edge of the selected edit cycles it Skarpa → Uskok → Mur. Esc cancels a drag, or
// clears the selection. A drag that starts anywhere else orbits as usual.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import { useEnvSurface, useVersions, versionSurface } from '../state/versions';
import { isOutside, rayGrid, sampleGrid, type HeightGrid } from '../terrain/grid';
import { DEFAULT_DZ, edgeHeights, edgesOf, heightAt, snapRect, withEdgeHeight, type EdgeMode, type Edges, type Edit, type Rect, type Side } from '../versions/edits';
import { ENV_LAYER, halfAt } from './split';

const COLOR = '#0969da';
const SELECTED_COLOR = '#bf8700';
/** The edge under the pointer (in the view or in the edge selects of the list). */
const EDGE_COLOR = '#cf222e';
/** Draped this far above the surface (m), sampled every STEP (m). */
const LIFT = 0.04;
const STEP = 0.1;
/** Lift / tilt drags: metres per screen pixel of vertical mouse movement. */
const M_PER_PX = 0.01;
/** A press that moves less than this (px) is a click. */
const CLICK_PX = 3;
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
    const { setDraft, setPreview, addEdit, replaceEdit, select, setHoverSide, setEditShape } = st();
    /** The selected edit of the active version. */
    const selectedEdit = () => {
      const s = st();
      return s.versions.find((v) => v.id === s.active)?.edits.find((e) => e.id === s.selected);
    };
    /**
     * area: dragging a new rect; lift: dragging a selected Wyrównaj up / down; edge: pressed near an edge of the
     * selected edit (a drag tilts a Wyrównaj, a click cycles the edge's mode).
     */
    type Drag =
      | { kind: 'area'; start: [number, number]; rect: Rect; z0: number }
      | { kind: 'lift'; edit: Edit & { tool: 'level' }; y0: number; moved: boolean }
      | { kind: 'edge'; edit: Edit; side: Side; y0: number; moved: boolean };
    let drag: Drag | undefined;
    let placing: Edit | undefined;
    let frame = 0;
    /** Where the pointer is over the selected edit (idle hover): an edge, its inside, or nowhere. */
    let over: Side | 'inside' | undefined;

    const setOver = (o: Side | 'inside' | undefined) => {
      if (o === over) return;
      over = o;
      setHoverSide(o && o !== 'inside' ? o : undefined);
      el.style.cursor = o === 'inside' ? 'ns-resize' : o ? 'pointer' : '';
    };
    const reset = () => {
      drag = placing = undefined;
      cancelAnimationFrame(frame);
      setDraft(undefined);
      setPreview(undefined);
    };
    /** Shows a dragged edit on the surface (once per frame) and its height in the bar. */
    const show = (e: Edit, z: number) => {
      placing = e;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setDraft({ ...e.rect, z });
        setPreview(e);
      });
    };
    const dz = (y0: number, y: number) => (y0 - y) * M_PER_PX;
    const cm = (v: number) => Math.round(v * 100) / 100;

    const onMove = (e: PointerEvent) => {
      if (!drag) {
        const sel = selectedEdit();
        const p = sel && pickRef.current(grid, e.clientX, e.clientY);
        if (!sel || !p) return setOver(undefined);
        const side = nearSide(sel.rect, p);
        const inside = p[0] > sel.rect.x0 && p[0] < sel.rect.x1 && p[1] > sel.rect.y0 && p[1] < sel.rect.y1;
        return setOver(side ?? (inside && sel.tool === 'level' ? 'inside' : undefined));
      }
      if (drag.kind === 'area') {
        const p = pickRef.current(grid, e.clientX, e.clientY);
        if (!p) return;
        drag.rect = snapRect(drag.start[0], drag.start[1], p[0], p[1]);
        setDraft({ ...drag.rect, z: st().tool === 'level' ? drag.z0 : undefined });
        return;
      }
      if (Math.abs(e.clientY - drag.y0) > CLICK_PX) drag.moved = true;
      if (!drag.moved) return;
      if (drag.kind === 'lift') {
        const z = cm(drag.edit.z + dz(drag.y0, e.clientY));
        show({ ...drag.edit, z }, z);
      } else if (drag.edit.tool === 'level') {
        const h = cm(edgeHeights(drag.edit)[drag.side] + dz(drag.y0, e.clientY));
        show(withEdgeHeight(drag.edit, drag.side, h), h);
      }
    };
    const onUp = () => {
      const d = drag;
      const done = placing;
      reset();
      if (!d) return;
      if (d.kind === 'area') {
        const t = st().tool;
        const base = { id: newId(), rect: d.rect, edges: NEW_EDGES, slope: st().newSlope };
        const edit: Edit | undefined =
          t === 'level' ? { ...base, tool: t, z: d.z0 } : t === 'raise' || t === 'lower' ? { ...base, tool: t, dz: DEFAULT_DZ } : undefined;
        if (!edit) return;
        addEdit(edit);
        select(edit.id); // now lift it from the middle or tilt it by an edge
      } else if (d.moved) {
        if (done) replaceEdit(done);
      } else if (d.kind === 'edge') {
        const edges = edgesOf(d.edit);
        setEditShape(d.edit.id, { edges: { ...edges, [d.side]: NEXT_MODE[edges[d.side]] } });
      }
    };
    // Capture phase on the container: a press we handle never reaches the camera controls.
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const sel = selectedEdit();
      const grab = () => {
        e.stopPropagation();
        e.preventDefault();
      };
      if (sel && over && over !== 'inside') {
        grab();
        drag = { kind: 'edge', edit: sel, side: over, y0: e.clientY, moved: false };
        return;
      }
      if (sel && over === 'inside' && sel.tool === 'level') {
        grab();
        drag = { kind: 'lift', edit: sel, y0: e.clientY, moved: false };
        return;
      }
      if (!st().tool) return;
      const p = pickRef.current(grid, e.clientX, e.clientY);
      if (!p) return;
      grab();
      setOver(undefined);
      const z0 = heightAt(grid, p[0], p[1]);
      drag = { kind: 'area', start: p, rect: snapRect(p[0], p[1], p[0], p[1]), z0 };
      setDraft({ ...drag.rect, z: st().tool === 'level' ? z0 : undefined });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drag) reset();
      else if (st().selected) select(undefined);
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      setOver(undefined);
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
