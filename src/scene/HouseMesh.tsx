// House massing (PLAN.md §5 M5): grey solids with flat shading in Environment; in Design their edges (to compare
// with the elevation underlays) and their footprints on the plan plane (z 0).
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { blockOutline, blockTriangles } from '../house/blocks';
import { useProject } from '../state/store';
import { DESIGN_LAYER, ENV_LAYER } from './split';

const SOLID_COLOR = '#d9d6d0';
const EDGE_COLOR = '#24292f';
const FOOTPRINT_COLOR = '#8250df';
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
  const footprints = useMemo(() => {
    const pos: number[] = [];
    for (const b of blocks) {
      const o = blockOutline(b);
      o.forEach((p, i) => {
        const q = o[(i + 1) % o.length]!;
        pos.push(p.x, 0, -p.y, q.x, 0, -q.y);
      });
    }
    return Float32Array.from(pos);
  }, [blocks]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => () => edges?.dispose(), [edges]);
  if (!show || !geo || !edges) return null;
  return (
    <group>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={SOLID_COLOR} flatShading side={DoubleSide} />
      </mesh>
      <lineSegments layers={DESIGN_LAYER} geometry={edges}>
        <lineBasicMaterial color={EDGE_COLOR} />
      </lineSegments>
      <lineSegments layers={DESIGN_LAYER} key={footprints.length}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[footprints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={FOOTPRINT_COLOR} />
      </lineSegments>
    </group>
  );
}
