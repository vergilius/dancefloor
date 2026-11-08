// Edit tools in the Environment viewport (PLAN.md §5 M4a): with a tool armed in a version, a left drag that starts on
// the terrain draws a rect snapped to the 0.5 m lattice (draped on the surface); release adds the edit. A drag that
// starts off the terrain orbits as usual. Esc cancels the drag. The edit selected in the list is outlined.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import { useEnvSurface, useVersions } from '../state/versions';
import { isOutside, rayGrid, sampleGrid, type HeightGrid } from '../terrain/grid';
import { DEFAULT_DZ, heightAt, snapRect, type Edit, type Rect, type Side } from '../versions/edits';
import { ENV_LAYER, halfAt } from './split';

const COLOR = '#0969da';
const SELECTED_COLOR = '#bf8700';
/** The edge hovered in the edge controls. */
const EDGE_COLOR = '#cf222e';
/** Draped this far above the surface (m), sampled every STEP (m). */
const LIFT = 0.04;
const STEP = 0.1;

let seq = 0;
const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

export function EditTool() {
  const { grid, version } = useEnvSurface();
  const tool = useVersions((s) => s.tool);
  const draft = useVersions((s) => s.draft);
  const selected = useVersions((s) => version?.edits.find((e) => e.id === s.selected));
  const hoverSide = useVersions((s) => s.hoverSide);
  const camera = useThree((s) => s.camera);
  const el = useThree((s) => s.events.connected) as HTMLElement | undefined;
  const on = Boolean(tool && version && grid);

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
    if (!on || !el || !grid) return;
    const { setDraft, addEdit, select } = useVersions.getState();
    let start: [number, number] | undefined;
    let rect: Rect | undefined;
    /** Wyrównaj's z: the surface height where the drag started (1 cm). */
    let z: number | undefined;
    const end = () => {
      start = undefined;
      rect = undefined;
      z = undefined;
      setDraft(undefined);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    const onMove = (e: PointerEvent) => {
      const p = start && pickRef.current(grid, e.clientX, e.clientY);
      if (!start || !p) return;
      rect = snapRect(start[0], start[1], p[0], p[1]);
      setDraft({ ...rect, z });
    };
    const onUp = () => {
      const r = rect;
      const level = z;
      end();
      if (!r || !tool) return;
      const { newEdges: edges, newSlope: slope } = useVersions.getState();
      const shape = { id: newId(), rect: r, edges, slope };
      let edit: Edit | undefined;
      if (tool === 'level') {
        if (level !== undefined) edit = { ...shape, tool, z: level };
      } else edit = { ...shape, tool, dz: DEFAULT_DZ };
      if (!edit) return;
      addEdit(edit);
      // Selected right away: the bar's edge controls now act on it.
      select(edit.id);
    };
    // Capture phase on the container: a drag that starts on the terrain never reaches the camera controls.
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = pickRef.current(grid, e.clientX, e.clientY);
      if (!p) return;
      e.stopPropagation();
      e.preventDefault();
      start = p;
      rect = snapRect(p[0], p[1], p[0], p[1]);
      z = tool === 'level' ? heightAt(grid, p[0], p[1]) : undefined;
      setDraft({ ...rect, z });
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && start && end();
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('keydown', onKey);
      end();
    };
  }, [on, el, grid, tool]);

  const line = useMemo(() => on && draft && grid && drapedRect(grid, draft), [on, draft, grid]);
  const sel = useMemo(() => selected && grid && drapedRect(grid, selected.rect), [selected, grid]);
  const edge = useMemo(() => hoverSide && selected && grid && drapedRect(grid, selected.rect, hoverSide), [hoverSide, selected, grid]);
  return (
    <>
      {line && <Outline points={line} color={COLOR} />}
      {sel && <Outline points={sel} color={SELECTED_COLOR} />}
      {edge && <Outline points={edge} color={EDGE_COLOR}/>}
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
