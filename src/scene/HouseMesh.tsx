// House massing (PLAN.md §5 M5). Environment: one solid per block, flat shading, a shade per block type, dark
// edges so the blocks read apart. Design: the same edges (to compare with the elevation underlays) and the
// footprints on the plan plane (z 0).
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { blockOutline, blockTriangles, polygonArea, type Block } from '../house/blocks';
import { useProject } from '../state/store';
import { DESIGN_LAYER, ENV_LAYER } from './split';

/** Main body (gable), other blocks, and thin ones (posts, columns: footprint < 1 m²). */
const COLORS = { gable: '#ece8e1', flat: '#cfc8bc', thin: '#7d766b' };
const ENV_EDGE_COLOR = '#55504a';
const DESIGN_EDGE_COLOR = '#24292f';
const FOOTPRINT_COLOR = '#8250df';
/** Edges between faces bent less than this (deg) are left out (e.g. wall face vs gable triangle). */
const EDGE_ANGLE = 1;
const THIN_AREA = 1;

export function HouseMesh() {
  const show = useProject((s) => s.showHouse);
  const blocks = useProject((s) => s.house.blocks);
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
  if (!show || blocks.length === 0) return null;
  return (
    <group>
      {blocks.map((b, i) => (
        <BlockSolid key={i} block={b} />
      ))}
      <lineSegments layers={DESIGN_LAYER}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[footprints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={FOOTPRINT_COLOR} />
      </lineSegments>
    </group>
  );
}

function BlockSolid({ block }: { block: Block }) {
  const geo = useMemo(() => {
    const world = blockTriangles(block);
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
  }, [block]);
  const edges = useMemo(() => new EdgesGeometry(geo, EDGE_ANGLE), [geo]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => edges.dispose(), [edges]);
  const color = block.kind === 'gable' ? COLORS.gable : polygonArea(block.polygon) < THIN_AREA ? COLORS.thin : COLORS.flat;
  // Flat blocks often share a face with the main body's wall: push them back so the wall wins instead of flickering.
  const behind = block.kind === 'flat';
  return (
    <>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={color} flatShading side={DoubleSide} polygonOffset={behind} polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments layers={ENV_LAYER} geometry={edges}>
        <lineBasicMaterial color={ENV_EDGE_COLOR} />
      </lineSegments>
      <lineSegments layers={DESIGN_LAYER} geometry={edges}>
        <lineBasicMaterial color={DESIGN_EDGE_COLOR} />
      </lineSegments>
    </>
  );
}
