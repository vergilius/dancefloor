// House massing (PLAN.md §5 M5). Environment: one solid per block, flat shading, a shade per block type, dark
// edges so the blocks read apart; with wall lines on the plans the main body and annex are hollow (M5b): their
// walls, the roof planes and the annex lid. Design: the same edges (to compare with the elevation underlays) and the
// footprints on the plan plane (z 0).
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry } from 'three';
import { blockOutline, blockTriangles, polygonArea, roofTriangles, type Block } from '../house/blocks';
import { hostsWalls } from '../house/walls';
import { useOpenings, useWalls } from '../state/house';
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

export function HouseMesh() {
  const show = useProject((s) => s.showHouse);
  const blocks = useProject((s) => s.house.blocks);
  const walls = useWalls();
  // With walls from the plans, the main body and the annex are drawn hollow (M5b): their walls, not their solids.
  const hollow = walls.triangles.length > 0;
  const ground = walls.storeys[0]?.z ?? 0;
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
        <BlockSolid key={i} block={b} hollow={hollow && (b.kind === 'gable' || hostsWalls(b, ground))} />
      ))}
      {hollow && <WallFaces triangles={walls.triangles} />}
      <Openings />
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

/** Hollow main body: its roof planes; hollow annex: its top as a lid (until the slabs, M5b T6). */
function hollowTriangles(b: Block): number[] {
  if (b.kind === 'gable') return roofTriangles(b);
  const all = blockTriangles(b);
  const lid: number[] = [];
  for (let i = 0; i < all.length; i += 9) if (all[i + 2] === b.top && all[i + 5] === b.top && all[i + 8] === b.top) lid.push(...all.slice(i, i + 9));
  return lid;
}

function WallFaces({ triangles }: { triangles: number[] }) {
  const geo = useMemo(() => sceneGeometry(triangles), [triangles]);
  const edges = useMemo(() => new EdgesGeometry(geo, EDGE_ANGLE), [geo]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <>
      <mesh layers={ENV_LAYER} geometry={geo}>
        <meshLambertMaterial color={WALL_COLOR} side={DoubleSide} />
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

/** Façade openings (T3): dark quads 1 cm in front of the face they were placed on. Environment only. */
function Openings() {
  const elevations = useOpenings();
  const geo = useMemo(() => {
    const pos: number[] = [];
    for (const e of elevations)
      for (const o of e.placed) {
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
