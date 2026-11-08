// Retaining walls (PLAN.md §5 M4b) of the active version in Environment, in their own colour. Derived from the
// surface (`walls.ts`); while an edit is dragged they follow its preview.
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { useEnvSurface, useVersions } from '../state/versions';
import { useProject } from '../state/store';
import { walls } from '../versions/walls';
import { ENV_LAYER } from './split';

/** Slate grey: apart from the beige house, the green terrain and Różnice's red / white / blue. */
const COLOR = '#76808a';
const EDGE_COLOR = '#3d444d';
const EDGE_ANGLE = 30;

export function WallMesh() {
  const show = useProject((s) => s.showTerrain);
  const { grid, version } = useEnvSurface();
  const preview = useVersions((s) => s.preview);
  const geo = useMemo(() => {
    if (!grid || !version) return undefined;
    const edits = preview ? version.edits.map((e) => (e.id === preview.id ? preview : e)) : version.edits;
    const ws = walls(grid, edits);
    if (!ws.length) return undefined;
    const all = new Float32Array(ws.reduce((n, w) => n + w.triangles.length, 0));
    let o = 0;
    for (const w of ws) {
      all.set(w.triangles, o);
      o += w.triangles.length;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(all, 3));
    g.computeVertexNormals();
    return g;
  }, [grid, version, preview]);
  const edges = useMemo(() => geo && new EdgesGeometry(geo, EDGE_ANGLE), [geo]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => () => edges?.dispose(), [edges]);
  if (!show || !geo || !edges) return null;
  return (
    <>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={COLOR} side={DoubleSide} />
      </mesh>
      <lineSegments layers={ENV_LAYER} geometry={edges}>
        <lineBasicMaterial color={EDGE_COLOR} />
      </lineSegments>
    </>
  );
}
