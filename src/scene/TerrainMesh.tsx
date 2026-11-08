// Existing terrain in the Environment viewport (PLAN.md §5 M3): one vertex per grid corner, height-tinted.
// Cells with an uncertain corner (outside the profiles' hull) are a second, lighter and semi-transparent index
// over the same positions. Plot outline (`PZT_ZAKRES`) draped just above the surface. Contours every 0.25 m
// (certain cells only), whole metres thicker and darker.
import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from 'three';
import { useProject } from '../state/store';
import { useTerrain } from '../state/terrain';
import { contours, type Contour } from '../terrain/contours';
import { sampleGrid, type HeightGrid } from '../terrain/grid';
import { ENV_LAYER } from './split';

/** Height ramp low → high. */
const RAMP = ['#4f7a35', '#9bbf5e', '#e0d08f'].map((c) => new Color(c));
/** Uncertain cells: mixed this far toward white, at this opacity. */
const UNCERTAIN_LIGHTEN = 0.55;
const UNCERTAIN_OPACITY = 0.45;
const OUTLINE_COLOR = '#b3261e';
/** Outline sits this far above the surface (m), sampled every OUTLINE_STEP (m) so it follows the relief. */
const OUTLINE_LIFT = 0.03;
const OUTLINE_STEP = 0.5;
/** Contours sit this far above their level (m), so the surface doesn't hide them. */
const CONTOUR_LIFT = 0.02;
const MINOR_COLOR = '#5b6b3a';
const MAJOR_COLOR = '#2e3a1c';
const MAJOR_WIDTH = 2; // px

export function TerrainMesh() {
  const show = useProject((s) => s.showTerrain);
  const { grid, plot } = useTerrain();
  const geo = useMemo(() => grid && terrainGeometry(grid), [grid]);
  const outline = useMemo(() => grid && plot && drapedOutline(grid, plot), [grid, plot]);
  const lines = useMemo(() => grid && contourLines(contours(grid)), [grid]);
  if (!show || !geo) return null;
  return (
    <group>
      <directionalLight layers={ENV_LAYER} position={[-25, 40, 30]} intensity={0.9} />
      <mesh layers={ENV_LAYER} geometry={geo.certain}>
        <meshLambertMaterial vertexColors side={DoubleSide} />
      </mesh>
      <mesh layers={ENV_LAYER} geometry={geo.uncertain}>
        <meshLambertMaterial vertexColors side={DoubleSide} transparent opacity={UNCERTAIN_OPACITY} depthWrite={false} />
      </mesh>
      {lines && lines.minor.length > 0 && (
        <lineSegments layers={ENV_LAYER}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[lines.minor, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={MINOR_COLOR} />
        </lineSegments>
      )}
      {lines && lines.major.length > 0 && (
        <Line layers={ENV_LAYER} segments points={lines.major} color={MAJOR_COLOR} lineWidth={MAJOR_WIDTH} />
      )}
      {outline && (
        <lineSegments layers={ENV_LAYER}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[outline, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={OUTLINE_COLOR} />
        </lineSegments>
      )}
    </group>
  );
}

/** Two geometries sharing the corner positions and normals: opaque cells, and cells with an uncertain corner. */
function terrainGeometry(g: HeightGrid): { certain: BufferGeometry; uncertain: BufferGeometry } {
  const w = g.cols + 1;
  const n = w * (g.rows + 1);
  const pos = new Float32Array(3 * n);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < n; k++) {
    min = Math.min(min, g.base[k]!);
    max = Math.max(max, g.base[k]!);
  }
  const span = max - min || 1;
  const col = new Float32Array(3 * n);
  const light = new Float32Array(3 * n);
  const c = new Color();
  for (let j = 0, k = 0; j <= g.rows; j++) {
    for (let i = 0; i < w; i++, k++) {
      const h = g.base[k]!;
      // Scene = (x, z, −y), see coords.ts.
      pos[3 * k] = g.origin.x + i * g.cell;
      pos[3 * k + 1] = h;
      pos[3 * k + 2] = -(g.origin.y + j * g.cell);
      ramp((h - min) / span, c);
      c.toArray(col, 3 * k);
      c.lerp(WHITE, UNCERTAIN_LIGHTEN).toArray(light, 3 * k);
    }
  }
  const sure: number[] = [];
  const unsure: number[] = [];
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const a = j * w + i;
      const b = a + 1;
      const d = a + w;
      const e = d + 1;
      const out = g.uncertain[a]! | g.uncertain[b]! | g.uncertain[d]! | g.uncertain[e]!;
      // Counter-clockwise in plan (east, then north), so the normals point up.
      (out ? unsure : sure).push(a, b, d, b, e, d);
    }
  }
  const position = new BufferAttribute(pos, 3);
  const certain = new BufferGeometry();
  certain.setAttribute('position', position);
  certain.setAttribute('color', new BufferAttribute(col, 3));
  certain.setIndex(new BufferAttribute(Uint32Array.from(sure), 1));
  // Normals over all cells, so shading is continuous across the certain/uncertain border.
  const all = new BufferGeometry();
  all.setAttribute('position', position);
  all.setIndex(new BufferAttribute(Uint32Array.from([...sure, ...unsure]), 1));
  all.computeVertexNormals();
  const normal = all.getAttribute('normal');
  certain.setAttribute('normal', normal);
  const uncertain = new BufferGeometry();
  uncertain.setAttribute('position', position);
  uncertain.setAttribute('normal', normal);
  uncertain.setAttribute('color', new BufferAttribute(light, 3));
  uncertain.setIndex(new BufferAttribute(Uint32Array.from(unsure), 1));
  return { certain, uncertain };
}

const WHITE = new Color('#ffffff');

function ramp(t: number, out: Color): Color {
  const s = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(s));
  return out.copy(RAMP[i]!).lerp(RAMP[i + 1]!, s - i);
}

/** Plan segments → scene line segments on the surface, split every OUTLINE_STEP. */
function drapedOutline(g: HeightGrid, s: Float64Array): Float32Array {
  const out: number[] = [];
  const at = (x: number, y: number) => out.push(x, sampleGrid(g, x, y) + OUTLINE_LIFT, -y);
  for (let k = 0; k < s.length; k += 4) {
    const [x1, y1, x2, y2] = [s[k]!, s[k + 1]!, s[k + 2]!, s[k + 3]!];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / OUTLINE_STEP));
    for (let q = 0; q < steps; q++) {
      at(x1 + ((x2 - x1) * q) / steps, y1 + ((y2 - y1) * q) / steps);
      at(x1 + ((x2 - x1) * (q + 1)) / steps, y1 + ((y2 - y1) * (q + 1)) / steps);
    }
  }
  return Float32Array.from(out);
}

/** Plan contours → scene segments: minor as a flat position buffer, major as point tuples for drei's fat lines. */
function contourLines(cs: Contour[]): { minor: Float32Array; major: [number, number, number][] } {
  const minor: number[] = [];
  const major: [number, number, number][] = [];
  for (const c of cs) {
    const y = c.h + CONTOUR_LIFT;
    for (let k = 0; k < c.segs.length; k += 2) {
      if (c.major) major.push([c.segs[k]!, y, -c.segs[k + 1]!]);
      else minor.push(c.segs[k]!, y, -c.segs[k + 1]!);
    }
  }
  return { minor: Float32Array.from(minor), major };
}
