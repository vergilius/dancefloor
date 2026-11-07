import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { planPositions } from './coords';

/** A plan sheet drawn horizontally at z: one LineSegments per layer. */
export function SheetObject({ sheet, z, color }: { sheet: NormalizedSheet; z: number; color: string }) {
  return (
    <group>
      {sheet.layers.map((l) => (
        <LayerLines key={l.name} segments={l.segments} z={z} color={color} />
      ))}
    </group>
  );
}

function LayerLines({ segments, z, color }: { segments: Float64Array; z: number; color: string }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(planPositions(segments, z), 3));
    return g;
  }, [segments, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}
