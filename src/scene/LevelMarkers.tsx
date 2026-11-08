// 3D level markers in Design, and in Environment when switched on (PLAN.md §5 M2, ADR 0001): a screen-sized dot + a camera-facing label.
import { useCallback, useMemo } from 'react';
import type { Object3D } from 'three';
import { Billboard, Text } from '@react-three/drei';
import type { SheetKind } from '../project/projectFile';
import { useRefValue } from '../state/levels';
import { useProject } from '../state/store';
import { toScene, type SheetPlacement } from './coords';
import { FONT_URL } from './font';
import { levelMarkers, type LevelMarker } from './markers';
import { ENV_LAYER } from './split';

const COLOR = '#0a3069';
/** Label size (m) and its gap above the dot. */
const FONT_SIZE = 0.18;
const GAP = 0.08;

type Drawn = { file: string; kind: SheetKind; placement: SheetPlacement }[];

/** Markers of the drawn sheets (also the measure tool's snap points). */
export function useLevelMarkers(drawn: Drawn): LevelMarker[] {
  const parsed = useProject((s) => s.parsed);
  const ref = useRefValue();
  return useMemo(
    () =>
      levelMarkers(
        drawn.flatMap((d) => {
          const p = parsed[d.file];
          return p?.status === 'done' ? [{ ...d, labels: p.summary.labels }] : [];
        }),
        ref,
      ),
    [drawn, parsed, ref],
  );
}

export function LevelMarkers({ drawn }: { drawn: Drawn }) {
  const show = useProject((s) => s.showLevels);
  const env = useProject((s) => s.showLevelsEnv);
  // Re-run on every element when `env` changes (a new callback identity makes React call it again).
  const layer = useCallback((o: Object3D | null) => void (o && (env ? o.layers.enable(ENV_LAYER) : o.layers.disable(ENV_LAYER))), [env]);
  const markers = useLevelMarkers(drawn);
  const positions = useMemo(() => Float32Array.from(markers.flatMap((m) => toScene(...m.world))), [markers]);
  if (!show || markers.length === 0) return null;
  return (
    <group>
      <points ref={layer} renderOrder={10}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={COLOR} size={7} sizeAttenuation={false} depthTest={false} />
      </points>
      {markers.map((m, i) => {
        const [x, y, z] = toScene(...m.world);
        return (
          <Billboard key={i} position={[x, y + GAP, z]}>
            <Text
              ref={layer}
              font={FONT_URL}
              fontSize={FONT_SIZE}
              anchorX="center"
              anchorY="bottom"
              color={COLOR}
              outlineWidth={FONT_SIZE * 0.12}
              outlineColor="#ffffff"
            >
              {m.label}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}
