// Edit tools in the Environment viewport (PLAN.md §5 M4a, M4b), sim-builder style. With a tool armed in a version, a
// left drag that starts on the terrain draws a rect snapped to the 0.5 m lattice and adds the edit on release
// (Wyrównaj flat at the drag's start height, Podnieś / Obniż by dz), selected. On a selected Wyrównaj, a drag inside
// moves it up / down and a drag near an edge moves only that edge (a ramp), 1 cm per pixel, previewed live, one undo
// step per drag. A click near an edge of the selected edit cycles it Skarpa → Uskok → Mur. Shift+drag an edge resizes
// the selected edit, Shift+drag inside moves it (its snap). Heights snap to ±0.00, the drawings' levels and the other
// edits (Alt = free). Esc cancels a drag, or clears the selection. A drag that starts anywhere else orbits as usual.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import { useProject } from '../state/store';
import { useActiveVersion, useEnvSurface, useVersions, versionSurface } from '../state/versions';
import { useDrawnSheets } from '../state/drawn';
import { useLevelMarkers } from './LevelMarkers';
import { t } from '../ui/strings';
import { isOutside, rayGrid, sampleGrid, type HeightGrid } from '../terrain/grid';
import { DEFAULT_DZ, edgeHeights, edgesOf, editValue, heightAt, moveRect, resizeRect, snapHeight, snapOf, snapRect, withEdgeHeight, withValue, type EdgeMode, type Edges, type Edit, type Rect, type Side, type SnapTarget } from '../versions/edits';
import { groundUnder, NEW_WALL_ABOVE } from '../versions/walls';
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
/** Lift / tilt drags snap to a target height within this many px (Alt = free). */
const SNAP_PX = 6;
/** A press that moves less than this (px) is a click. */
const CLICK_PX = 3;
/** Hover distance to an edge of the selected edit (plan m). */
const EDGE_HIT = 0.3;
/** New edits: Skarpa on all 4 edges (the bar's 1:n). */
const NEW_EDGES: Edges = { w: 'slope', e: 'slope', s: 'slope', n: 'slope' };
const NEXT_MODE: Record<EdgeMode, EdgeMode> = { slope: 'step', step: 'slope' };

let seq = 0;
const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A wall side is grabbed within this many screen px of its top outline. */
const WALL_SIDE_PX = 8;

/** Client px of a scene point in the Environment half (undefined behind the camera). */
function toClient(camera: Camera, el: HTMLElement, p: Vector3): [number, number] | undefined {
  const v = p.clone().project(camera);
  if (v.z > 1) return undefined;
  const r = el.getBoundingClientRect();
  const left = Math.floor(r.width / 2);
  return [r.left + left + ((v.x + 1) / 2) * (r.width - left), r.top + ((1 - v.y) / 2) * r.height];
}

const segDist = ([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

/** Point in a convex polygon (any winding). */
function inPolygon([px, py]: [number, number], poly: [number, number][]): boolean {
  let sign = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k]!;
    const [bx, by] = poly[(k + 1) % poly.length]!;
    const c = Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax));
    if (c === 0) continue;
    if (sign === 0) sign = c;
    else if (c !== sign) return false;
  }
  return true;
}

/** A side of the wall's top outline within WALL_SIDE_PX of the pointer (resize), else whether the box is hit (lift). */
function wallHover(camera: Camera, el: HTMLElement, e: Edit & { tool: 'wall' }, client: [number, number], boxHit: boolean): Side | 'inside' | undefined {
  const r = e.rect;
  // Top corners in order s-w, s-e, n-e, n-w; side k joins corner k and k + 1 (s, e, n, w).
  const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(([x, y]) => toClient(camera, el, new Vector3(x!, e.top, -y!)));
  if (pts.some((q) => !q)) return boxHit ? 'inside' : undefined;
  const poly = pts as [number, number][];
  const sides: Side[] = ['s', 'e', 'n', 'w'];
  const best = sides.map((s, k) => [s, segDist(client, poly[k]!, poly[(k + 1) % 4]!)] as const).sort((a, b) => a[1] - b[1])[0]!;
  if (best[1] <= WALL_SIDE_PX) return best[0];
  return boxHit || inPolygon(client, poly) ? 'inside' : undefined;
}

/** Dragged up / down from its middle: Wyrównaj (z) and Mur (top). */
const liftable = (e: Edit) => e.tool === 'level' || e.tool === 'wall';

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
  /** Distance along the pointer ray to the wall's box (lowest surface under it … top), if the ray hits it. */
  const wallHit = (g: HeightGrid, w: Edit & { tool: 'wall' }, clientX: number, clientY: number): number | undefined => {
    if (!el) return undefined;
    const { half, ndc } = halfAt(clientX, clientY, el.getBoundingClientRect());
    if (half !== 'env') return undefined;
    raycaster.setFromCamera(new Vector2(...ndc), camera);
    const r = w.rect;
    const lo = Math.min(groundUnder(g, r).min, w.top);
    // Scene (x, height, −y); a few cm of slack so a thin wall is easy to hit.
    const box = new Box3(new Vector3(r.x0 - 0.03, lo, -r.y1 - 0.03), new Vector3(r.x1 + 0.03, w.top + 0.03, -r.y0 + 0.03));
    const hit = raycaster.ray.intersectBox(box, new Vector3());
    return hit ? hit.distanceTo(raycaster.ray.origin) : undefined;
  };
  // Snap targets for lift / tilt drags: ±0.00, the drawings' level marks, the other edits' heights.
  const markers = useLevelMarkers(useDrawnSheets());
  const edits = useActiveVersion()?.edits;
  const targets = useMemo(() => {
    const out: (SnapTarget & { id?: string })[] = [{ z: 0, label: '±0.00' }];
    for (const m of markers) out.push({ z: Math.round(m.world[2] * 100) / 100, label: m.label });
    (edits ?? []).forEach((e, i) => {
      const label = `${t.versions.tools[e.tool]} ${i + 1}`;
      if (e.tool === 'wall') out.push({ id: e.id, z: e.top, label });
      if (e.tool !== 'level') return;
      out.push({ id: e.id, z: e.z, label });
      if (e.tilt) for (const [s, z] of Object.entries(edgeHeights(e))) out.push({ id: e.id, z, label: `${label} ${t.versions.sides[s as Side]}` });
    });
    return out;
  }, [markers, edits]);
  const targetsRef = useRef(targets);
  const pickRef = useRef(pick);
  const wallHitRef = useRef(wallHit);
  const cameraRef = useRef(camera);
  useEffect(() => {
    pickRef.current = pick;
    targetsRef.current = targets;
    wallHitRef.current = wallHit;
    cameraRef.current = camera;
  });

  useEffect(() => {
    if (!on || !el || !picked) return;
    const grid = picked;
    const st = useVersions.getState;
    const { setDraft, setPreview, addEdit, replaceEdit, select, setHoverSide, setEditShape, deleteEdit } = st();
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
      | { kind: 'lift'; edit: Edit; y0: number; moved: boolean }
      | { kind: 'edge'; edit: Edit; side: Side; y0: number; moved: boolean }
      | { kind: 'resize'; edit: Edit; side: Side; z: number; moved: boolean }
      | { kind: 'move'; edit: Edit; z: number; start: [number, number]; moved: boolean };
    let drag: Drag | undefined;
    let placing: Edit | undefined;
    let frame = 0;
    /** Where the pointer is over the selected edit (idle hover): an edge, its inside, or nowhere. */
    let over: Side | 'inside' | undefined;

    const setOver = (o: Side | 'inside' | undefined) => {
      if (o === over) return;
      over = o;
      setHoverSide(o && o !== 'inside' ? o : undefined);
      const sel = selectedEdit();
      el.style.cursor = o === 'inside' ? (sel && liftable(sel) ? 'ns-resize' : 'move') : o ? 'pointer' : '';
    };
    const reset = () => {
      drag = placing = undefined;
      cancelAnimationFrame(frame);
      setDraft(undefined);
      setPreview(undefined);
    };
    /** Shows a dragged edit on the surface (once per frame) and its height in the bar. */
    const show = (e: Edit, z: number, snap?: string) => {
      placing = e;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setDraft({ ...e.rect, z, snap });
        setPreview(e);
      });
    };
    const dz = (y0: number, y: number) => (y0 - y) * M_PER_PX;
    const cm = (v: number) => Math.round(v * 100) / 100;
    /** A dragged height snapped to a target (not the dragged edit's own heights), unless Alt is held. */
    const snapped = (z: number, edit: Edit, start: number, alt: boolean) =>
      alt ? { z } : snapHeight(z, [{ z: start, label: t.versions.snapStart }, ...targetsRef.current.filter((s) => s.id !== edit.id)], SNAP_PX * M_PER_PX + 1e-9);
    /** Plan point under the pointer on the horizontal plane at height z. */
    const planeAt = (clientX: number, clientY: number, z: number): [number, number] | undefined => {
      const { half, ndc } = halfAt(clientX, clientY, el.getBoundingClientRect());
      if (half !== 'env') return undefined;
      raycaster.setFromCamera(new Vector2(...ndc), cameraRef.current);
      const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -z), new Vector3());
      return hit ? [hit.x, -hit.z] : undefined;
    };
    /** Height of the plane a resize / move follows: the wall's top, the platform's height, else the ground. */
    const planeZ = (e: Edit) =>
      e.tool === 'wall' ? e.top : e.tool === 'level' ? e.z : heightAt(grid, (e.rect.x0 + e.rect.x1) / 2, (e.rect.y0 + e.rect.y1) / 2);

    const onMove = (e: PointerEvent) => {
      if (!drag) {
        const sel = selectedEdit();
        if (sel?.tool === 'wall') {
          const hit = wallHitRef.current(grid, sel, e.clientX, e.clientY) !== undefined;
          return setOver(wallHover(cameraRef.current, el, sel, [e.clientX, e.clientY], hit));
        }
        const p = sel && pickRef.current(grid, e.clientX, e.clientY);
        if (!sel || !p) return setOver(undefined);
        const side = nearSide(sel.rect, p);
        const r = sel.rect;
        const inside = p[0] > r.x0 && p[0] < r.x1 && p[1] > r.y0 && p[1] < r.y1;
        return setOver(side ?? (inside ? 'inside' : undefined));
      }
      if (drag.kind === 'area') {
        const p = pickRef.current(grid, e.clientX, e.clientY);
        if (!p) return;
        drag.rect = snapRect(drag.start[0], drag.start[1], p[0], p[1], snapOf(st().tool ?? 'level'));
        setDraft({ ...drag.rect, z: st().tool === 'level' ? drag.z0 : undefined });
        return;
      }
      if (drag.kind === 'resize' || drag.kind === 'move') {
        // The side (or the whole rect) follows the pointer on the horizontal plane at the edit's height.
        const hit = planeAt(e.clientX, e.clientY, drag.z);
        if (!hit) return;
        const step = snapOf(drag.edit.tool);
        const r0 = drag.edit.rect;
        const rect =
          drag.kind === 'resize'
            ? resizeRect(r0, drag.side, drag.side === 'w' || drag.side === 'e' ? hit[0] : hit[1], step)
            : moveRect(r0, hit[0] - drag.start[0], hit[1] - drag.start[1], step);
        if (!drag.moved && rect.x0 === r0.x0 && rect.x1 === r0.x1 && rect.y0 === r0.y0 && rect.y1 === r0.y1) return;
        drag.moved = true;
        show({ ...drag.edit, rect }, editValue(drag.edit));
        return;
      }
      if (Math.abs(e.clientY - drag.y0) > CLICK_PX) drag.moved = true;
      if (!drag.moved) return;
      if (drag.kind === 'lift') {
        const z0 = editValue(drag.edit);
        const s = snapped(cm(z0 + dz(drag.y0, e.clientY)), drag.edit, z0, e.altKey);
        show(withValue(drag.edit, s.z), s.z, s.snap);
      } else if (drag.edit.tool === 'level') {
        const h0 = edgeHeights(drag.edit)[drag.side];
        const s = snapped(cm(h0 + dz(drag.y0, e.clientY)), drag.edit, h0, e.altKey);
        show(withEdgeHeight(drag.edit, drag.side, s.z), s.z, s.snap);
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
          t === 'level'
            ? { ...base, tool: t, z: d.z0 }
            : t === 'raise' || t === 'lower'
              ? { ...base, tool: t, dz: DEFAULT_DZ }
              : t === 'wall'
                ? { id: base.id, rect: d.rect, tool: t, top: cm(groundUnder(grid, d.rect).max + NEW_WALL_ABOVE) }
                : undefined;
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
      // 0. Shift on the selected edit: an edge resizes it, the inside moves it.
      if (sel && over && e.shiftKey) {
        const z = planeZ(sel);
        const start = planeAt(e.clientX, e.clientY, z);
        if (over !== 'inside') {
          grab();
          drag = { kind: 'resize', edit: sel, side: over, z, moved: false };
          return;
        }
        if (start) {
          grab();
          drag = { kind: 'move', edit: sel, z, start, moved: false };
          return;
        }
      }
      // 1. The selected wall: a side resizes it, its box lifts its top.
      if (sel?.tool === 'wall' && over) {
        grab();
        drag = over === 'inside' ? { kind: 'lift', edit: sel, y0: e.clientY, moved: false } : { kind: 'resize', edit: sel, side: over, z: sel.top, moved: false };
        return;
      }
      // 2. Another wall under the pointer (the nearest box along the ray) gets selected, even on a selected terrace.
      const s = st();
      let wall: Edit | undefined;
      let nearest = Infinity;
      for (const w of s.versions.find((v) => v.id === s.active)?.edits ?? []) {
        if (w.tool !== 'wall' || w.id === sel?.id) continue;
        const d = wallHitRef.current(grid, w, e.clientX, e.clientY);
        if (d !== undefined && d < nearest) [wall, nearest] = [w, d];
      }
      if (wall) {
        grab();
        setOver(undefined);
        select(wall.id);
        return;
      }
      // 3. The selected terrain edit: an edge tilts / toggles, the inside lifts.
      if (sel && over && over !== 'inside') {
        grab();
        drag = { kind: 'edge', edit: sel, side: over, y0: e.clientY, moved: false };
        return;
      }
      if (sel && over === 'inside' && liftable(sel)) {
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
      drag = { kind: 'area', start: p, rect: snapRect(p[0], p[1], p[0], p[1], snapOf(st().tool ?? 'level')), z0 };
      setDraft({ ...drag.rect, z: st().tool === 'level' ? z0 : undefined });
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        if (drag) reset();
        else if (st().selected) select(undefined);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && !drag && !useProject.getState().houseDraw) {
        // Deletes the selected edit (undoable); Backspace belongs to the house outline tool while it draws.
        const id = st().selected;
        if (!id) return;
        e.preventDefault();
        setOver(undefined);
        deleteEdit(id);
      }
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
