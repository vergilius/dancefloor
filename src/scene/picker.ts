// Picking a point on the drawn sheets in the Design half (measure tool M2, house draw tool M5): a visible segment
// endpoint or level marker within SNAP_PX on screen, else the nearest sheet plane hit along the ray.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Matrix4, Raycaster, Vector2 } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { layerVisible, type LayerOverrides } from '../project/layerGroups';
import { useProject } from '../state/store';
import type { SheetPlacement } from './coords';
import { useLevelMarkers } from './LevelMarkers';
import { hitSheet, nearestOnScreen, SNAP_PX, worldPoints, type Vec3 } from './snap';
import { halfAt } from './split';
import type { SheetKind } from '../project/projectFile';

export type PickDrawn = { file: string; kind: SheetKind; placement: SheetPlacement; sheet: NormalizedSheet; layers?: LayerOverrides };
export type Pick = { world: Vec3; snapped: boolean };

const raycaster = new Raycaster();
const matrix = new Matrix4();

/**
 * Returns a stable ref to `pickAt(clientX, clientY)`. Snap points are computed only while `on`.
 * `horizontalOnly`: only horizontal sheets (plans, site) are hit and snapped to, and no level markers.
 */
export function usePicker(on: boolean, drawn: PickDrawn[], horizontalOnly = false) {
  const groups = useProject((s) => s.groups);
  const showLevels = useProject((s) => s.showLevels);
  const markers = useLevelMarkers(drawn);
  const camera = useThree((s) => s.camera);
  const el = useThree((s) => s.events.connected) as HTMLElement | undefined;

  const targets = useMemo(
    () =>
      on
        ? drawn.flatMap((d) =>
            d.sheet.extents && !(horizontalOnly && d.placement.type !== 'horizontal')
              ? [{ placement: d.placement, extents: d.sheet.extents, points: worldPoints(d.sheet, d.placement, (l) => layerVisible(groups, d.layers, l)) }]
              : [],
          )
        : [],
    [on, drawn, groups, horizontalOnly],
  );
  const markerPoints = useMemo(
    () => Float64Array.from(showLevels && !horizontalOnly ? markers.flatMap((m) => m.world) : []),
    [markers, showLevels, horizontalOnly],
  );

  const pickAt = (clientX: number, clientY: number): Pick | undefined => {
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const { half, ndc } = halfAt(clientX, clientY, rect);
    if (half !== 'design') return undefined;
    raycaster.setFromCamera(new Vector2(...ndc), camera);
    const { origin, direction } = raycaster.ray;
    const ray = { origin: origin.toArray() as Vec3, dir: direction.toArray() as Vec3 };
    const hits = targets
      .flatMap((tg) => {
        const h = hitSheet(ray, tg.placement, tg.extents);
        return h ? [{ ...h, points: tg.points }] : [];
      })
      .sort((a, b) => a.t - b.t);
    const m = matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const pointer: [number, number] = [clientX - rect.left, clientY - rect.top];
    const snapped = nearestOnScreen([...hits.map((h) => h.points), markerPoints], m, pointer, Math.floor(rect.width / 2), rect.height, SNAP_PX);
    if (snapped) return { world: snapped, snapped: true };
    return hits[0] && { world: hits[0].world, snapped: false };
  };
  const pickRef = useRef(pickAt);
  useEffect(() => {
    pickRef.current = pickAt;
  });
  return { pickRef, el };
}
