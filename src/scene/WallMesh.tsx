// Mur walls (PLAN.md §5 M4b) of the active version in Environment, in the house's colour. Each is a box from the
// lowest surface under its rect up to its top (`walls.ts`); while one is dragged up / down it follows the preview.
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { useEnvSurface, useVersions } from '../state/versions';
import { useProject } from '../state/store';
import { wallSolid } from '../versions/walls';
import { COLORS, ENV_EDGE_COLOR } from './HouseMesh';
import { ENV_LAYER } from './split';

export function WallMesh() {
  const show = useProject((s) => s.showTerrain);
  const { grid, version } = useEnvSurface();
  const preview = useVersions((s) => s.preview);
  const geo = useMemo(() => {
    if (!grid || !version) return undefined;
    const edits = preview ? version.edits.map((e) => (e.id === preview.id ? preview : e)) : version.edits;
    const parts = edits.flatMap((e) => (e.tool === 'wall' ? [wallSolid(grid, e).triangles] : []));
    if (!parts.length) return undefined;
    const all = new Float32Array(parts.reduce((n, t) => n + t.length, 0));
    let o = 0;
    for (const t of parts) {
      all.set(t, o);
      o += t.length;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(all, 3));
    g.computeVertexNormals();
    return g;
  }, [grid, version, preview]);
  const edges = useMemo(() => geo && new EdgesGeometry(geo), [geo]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => () => edges?.dispose(), [edges]);
  if (!show || !geo || !edges) return null;
  return (
    <>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={COLORS.gable} side={DoubleSide} />
      </mesh>
      <lineSegments layers={ENV_LAYER} geometry={edges}>
        <lineBasicMaterial color={ENV_EDGE_COLOR} />
      </lineSegments>
    </>
  );
}
