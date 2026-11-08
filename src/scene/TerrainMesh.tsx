// Existing terrain in the Environment viewport (PLAN.md §5 M3): one vertex per grid corner, height-tinted. Plot outline (`PZT_ZAKRES`) draped just above the surface. Contours every 0.25 m
// (certain cells only), whole metres thicker and darker.
import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from 'three';
import { useProject } from '../state/store';
import { useEnvSurface, useVersions, versionSurface } from '../state/versions';
import { contours, type Contour } from '../terrain/contours';
import { cellOutside, isOutside, sampleGrid, type HeightGrid } from '../terrain/grid';
import { useUi } from '../state/ui';
import { ENV_LAYER } from './split';

/** Height ramp low → high. */
const RAMP = ['#4f7a35', '#9bbf5e', '#e0d08f'].map((c) => new Color(c));
const OUTLINE_COLOR = '#b3261e';
/** Outline sits this far above the surface (m), sampled every OUTLINE_STEP (m) so it follows the relief. */
const OUTLINE_LIFT = 0.03;
const OUTLINE_STEP = 0.5;
/** Contours sit this far above their level (m), so the surface doesn't hide them. */
const CONTOUR_LIFT = 0.02;
const MINOR_COLOR = '#5b6b3a';
const MAJOR_COLOR = '#2e3a1c';
const MAJOR_WIDTH = 2; // px
/** Clean view (showcase): one lawn colour, no contours or plot outline. */
const LAWN_COLOR = '#7da35a';

export function TerrainMesh() {
  const show = useProject((s) => s.showTerrain);
  // Podgląd: the generated terrain; in an edit version: its own surface (M4a).
  const { grid, plot, version } = useEnvSurface();
  // "Różnice" (M4a): colour by Δh against the version's frozen base instead of by height.
  const showDiff = useVersions((s) => s.showDiff);
  const diffBase = showDiff ? version?.grid : undefined;
  const geo = useMemo(() => grid && terrainGeometry(grid, diffBase), [grid, diffBase]);
  const outline = useMemo(() => grid && plot && drapedOutline(grid, plot), [grid, plot]);
  // Contours are the slow part: while Wyrównaj previews a height they follow the committed surface (update on commit).
  const previewing = useVersions((s) => s.preview !== undefined);
  const contourGrid = previewing && version ? versionSurface(version).grid : grid;
  const lines = useMemo(() => contourGrid && contourLines(contours(contourGrid)), [contourGrid]);
  const clean = useUi((s) => s.clean);
  if (!show || !geo) return null;
  const lawn = clean && !diffBase;
  return (
    <group>
      <mesh layers={ENV_LAYER} geometry={geo} receiveShadow castShadow={clean}>
        <meshLambertMaterial key={lawn ? 'lawn' : 'tint'} vertexColors={!lawn} color={lawn ? LAWN_COLOR : '#ffffff'} side={DoubleSide} />
      </mesh>
      {!clean && lines && lines.minor.length > 0 && (
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
      {!clean && outline && (
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

/**
 * One vertex per grid corner, height-tinted, or with `diff` coloured by Δh = surface − diff (red cut, blue fill,
 * white 0, saturated at ±DIFF_SATURATION). Cells beyond the plot + margin are left out.
 */
function terrainGeometry(g: HeightGrid, diff?: HeightGrid): BufferGeometry {
  const w = g.cols + 1;
  const n = w * (g.rows + 1);
  const pos = new Float32Array(3 * n);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < n; k++) {
    if (isOutside(g, k)) continue;
    min = Math.min(min, g.base[k]!);
    max = Math.max(max, g.base[k]!);
  }
  const span = max - min || 1;
  const col = new Float32Array(3 * n);
  const c = new Color();
  for (let j = 0, k = 0; j <= g.rows; j++) {
    for (let i = 0; i < w; i++, k++) {
      const h = g.base[k]!;
      // Scene = (x, z, −y), see coords.ts.
      pos[3 * k] = g.origin.x + i * g.cell;
      pos[3 * k + 1] = h;
      pos[3 * k + 2] = -(g.origin.y + j * g.cell);
      (diff ? diffColor(h - diff.base[k]!, c) : ramp((h - min) / span, c)).toArray(col, 3 * k);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const a = j * w + i;
      if (cellOutside(g, a)) continue; // beyond the plot + margin: not drawn
      const b = a + 1;
      const d = a + w;
      const e = d + 1;
      // Counter-clockwise in plan (east, then north), so the normals point up.
      index.push(a, b, d, b, e, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(Uint32Array.from(index), 1));
  geo.computeVertexNormals();
  return geo;
}

/** Δh at which the diff colours are fully saturated (m). */
export const DIFF_SATURATION = 1;
export const CUT_COLOR = '#cf222e';
export const FILL_COLOR = '#0969da';
const CUT = new Color(CUT_COLOR);
const FILL = new Color(FILL_COLOR);
const WHITE = new Color('#ffffff');

function diffColor(d: number, out: Color): Color {
  return out.copy(WHITE).lerp(d < 0 ? CUT : FILL, Math.min(1, Math.abs(d) / DIFF_SATURATION));
}

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
