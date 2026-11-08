// House massing (PLAN.md §5 M5). Environment: one solid per block, flat shading, a shade per block type, dark
// edges so the blocks read apart; with wall lines on the plans the main body and annex are hollow (M5b): their
// walls, the roof planes and the annex lid. Design: the same edges (to compare with the elevation underlays) and the
// footprints on the plan plane (z 0).
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { blockOutline, blockTriangles, polygonArea, roofTriangles, type Block } from '../house/blocks';
import { hostsWalls } from '../house/walls';
import { useHouse3D } from '../state/house';
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
const OPENING_COLOR = '#2b3036';
const WALL_COLOR = '#f1eee8';
const WALL_EDGE_COLOR = '#8a847a';
const SLAB_COLOR = '#d8d2c6';

export function HouseMesh() {
  const show = useProject((s) => s.showHouse);
  const blocks = useProject((s) => s.house.blocks);
  const house = useHouse3D();
  // With walls from the plans, the main body and the annex are drawn hollow (M5b): walls, fills, slabs, roof.
  const hollow = house.walls.length > 0;
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
        <BlockSolid key={i} block={b} hollow={hollow && (b.kind === 'gable' || hostsWalls(b, house.groundZ))} />
      ))}
      {hollow && <WallFaces triangles={house.walls} color={WALL_COLOR} />}
      {hollow && <WallFaces triangles={house.fills} color={WALL_COLOR} />}
      {hollow && <WallFaces triangles={house.slabs} color={SLAB_COLOR} />}
      <Openings elevations={house.openings} />
      <lineSegments layers={DESIGN_LAYER}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[footprints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={FOOTPRINT_COLOR} />
      </lineSegments>
    </group>
  );
}

/** World triangles → scene positions (x, z, −y), see coords.ts. */
function sceneGeometry(world: ArrayLike<number>): BufferGeometry {
  const pos = new Float32Array(world.length);
  for (let i = 0; i < world.length; i += 3) {
    pos[i] = world[i]!;
    pos[i + 1] = world[i + 2]!;
    pos[i + 2] = -world[i + 1]!;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: flat normals
  return g;
}

/** Hollow main body: its roof planes; a hollow annex: nothing of its own (walls and slabs draw it). */
const hollowTriangles = (b: Block): number[] => (b.kind === 'gable' ? roofTriangles(b) : []);

function WallFaces({ triangles, color }: { triangles: number[]; color: string }) {
  const geo = useMemo(() => sceneGeometry(triangles), [triangles]);
  const edges = useMemo(() => new EdgesGeometry(geo, EDGE_ANGLE), [geo]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={color} side={DoubleSide} />
      </mesh>
      <lineSegments layers={ENV_LAYER} geometry={edges}>
        <lineBasicMaterial color={WALL_EDGE_COLOR} />
      </lineSegments>
    </>
  );
}

function BlockSolid({ block, hollow }: { block: Block; hollow: boolean }) {
  // Design keeps the full block's edges (compared with the underlays); Environment shows the hollow parts.
  const full = useMemo(() => sceneGeometry(blockTriangles(block)), [block]);
  const fullEdges = useMemo(() => new EdgesGeometry(full, EDGE_ANGLE), [full]);
  const part = useMemo(() => (hollow ? sceneGeometry(hollowTriangles(block)) : undefined), [block, hollow]);
  const partEdges = useMemo(() => part && new EdgesGeometry(part, EDGE_ANGLE), [part]);
  useEffect(() => () => full.dispose(), [full]);
  useEffect(() => () => fullEdges.dispose(), [fullEdges]);
  useEffect(() => () => part?.dispose(), [part]);
  useEffect(() => () => partEdges?.dispose(), [partEdges]);
  const color = block.kind === 'gable' ? COLORS.gable : polygonArea(block.polygon) < THIN_AREA ? COLORS.thin : COLORS.flat;
  // Flat blocks often share a face with the main body's wall: push them back so the wall wins instead of flickering.
  const behind = block.kind === 'flat';
  return (
    <>
      <mesh layers={ENV_LAYER} geometry={part ?? full}>
        <meshLambertMaterial color={color} flatShading side={DoubleSide} polygonOffset={behind} polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments layers={ENV_LAYER} geometry={partEdges ?? fullEdges}>
        <lineBasicMaterial color={ENV_EDGE_COLOR} />
      </lineSegments>
      <lineSegments layers={DESIGN_LAYER} geometry={fullEdges}>
        <lineBasicMaterial color={DESIGN_EDGE_COLOR} />
      </lineSegments>
    </>
  );
}

/** Façade openings (T3) not cut through a hollow wall: dark quads 1 cm in front of their face. Environment only. */
function Openings({ elevations }: { elevations: ReturnType<typeof useHouse3D>['openings'] }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    for (const e of elevations)
      for (const o of e.placed) {
        if (o.hole) continue;
        const [a, b, c, d] = o.corners.map(([x, y, z]) => [x, z, -y]) as [number[], number[], number[], number[]];
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    if (pos.length === 0) return undefined;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    return g;
  }, [elevations]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  return (
    <mesh layers={ENV_LAYER} geometry={geo}>
      <meshBasicMaterial color={OPENING_COLOR} side={DoubleSide} />
    </mesh>
  );
}
