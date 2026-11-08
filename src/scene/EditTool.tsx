// Edit tools in the Environment viewport (PLAN.md §5 M4a): with a tool armed in a version, a left drag that starts on
// the terrain draws a rect snapped to the 0.5 m lattice (draped on the surface); release adds the edit. A drag that
// starts off the terrain orbits as usual. Esc cancels the drag.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import { useEnvSurface, useVersions } from '../state/versions';
import { rayGrid, sampleGrid, type HeightGrid } from '../terrain/grid';
import { meanUnder, snapRect, type Rect } from '../versions/edits';
import { ENV_LAYER, halfAt } from './split';

const COLOR = '#0969da';
/** Draped this far above the surface (m), sampled every STEP (m). */
const LIFT = 0.04;
const STEP = 0.1;

let seq = 0;
const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

export function EditTool() {
  const { grid, version } = useEnvSurface();
  const tool = useVersions((s) => s.tool);
  const draft = useVersions((s) => s.draft);
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
    return hit && [hit[0], hit[1]];
  };
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    if (!on || !el || !grid) return;
    const { setDraft, addEdit } = useVersions.getState();
    let start: [number, number] | undefined;
    let rect: Rect | undefined;
    const end = () => {
      start = undefined;
      rect = undefined;
      setDraft(undefined);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    const onMove = (e: PointerEvent) => {
      const p = start && pickRef.current(grid, e.clientX, e.clientY);
      if (!start || !p) return;
      rect = snapRect(start[0], start[1], p[0], p[1]);
      setDraft(rect);
    };
    const onUp = () => {
      const r = rect;
      end();
      const z = r && meanUnder(grid, grid.base, r);
      if (r && z !== undefined) addEdit({ id: newId(), tool: 'level', rect: r, z });
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
      setDraft(rect);
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
  }, [on, el, grid]);

  const line = useMemo(() => draft && grid && drapedRect(grid, draft), [draft, grid]);
  if (!on || !line) return null;
  return (
    <lineSegments layers={ENV_LAYER} renderOrder={10} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[line, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={COLOR} depthTest={false} />
    </lineSegments>
  );
}

const raycaster = new Raycaster();

/** The rect's outline as scene segments following the surface. */
function drapedRect(g: HeightGrid, r: Rect): Float32Array {
  const out: number[] = [];
  const at = (x: number, y: number) => out.push(x, sampleGrid(g, x, y) + LIFT, -y);
  const corners: [number, number][] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  for (let k = 0; k < 4; k++) {
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
