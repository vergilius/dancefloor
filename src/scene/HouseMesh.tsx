// House massing (PLAN.md §5 M5): grey solids with flat shading in Environment; their edges in Design, so the
// blocks can be compared with the plan and elevation underlays there.
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { blockTriangles } from '../house/blocks';
import { useProject } from '../state/store';
import { DESIGN_LAYER, ENV_LAYER } from './split';

const SOLID_COLOR = '#d9d6d0';
const EDGE_COLOR = '#24292f';
/** Edges between faces bent less than this (deg) are left out (e.g. wall face vs gable triangle). */
const EDGE_ANGLE = 1;

export function HouseMesh() {
  const show = useProject((s) => s.showHouse);
  const blocks = useProject((s) => s.house.blocks);
  const geo = useMemo(() => {
    if (blocks.length === 0) return undefined;
    const world = blocks.flatMap(blockTriangles);
    const pos = new Float32Array(world.length);
    // Scene = (x, z, −y), see coords.ts.
    for (let i = 0; i < world.length; i += 3) {
      pos[i] = world[i]!;
      pos[i + 1] = world[i + 2]!;
      pos[i + 2] = -world[i + 1]!;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.computeVertexNormals(); // non-indexed: flat normals
    return g;
  }, [blocks]);
  const edges = useMemo(() => geo && new EdgesGeometry(geo, EDGE_ANGLE), [geo]);
  if (!show || !geo || !edges) return null;
  return (
    <group>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={SOLID_COLOR} flatShading side={DoubleSide} />
      </mesh>
      <lineSegments layers={DESIGN_LAYER} geometry={edges}>
        <lineBasicMaterial color={EDGE_COLOR} />
      </lineSegments>
    </group>
  );
}
