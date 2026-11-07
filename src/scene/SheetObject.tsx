import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { NormalizedSheet } from '../dwg/types';
import { sheetPositions, type SheetPlacement } from './coords';

type Props = { sheet: NormalizedSheet; placement: SheetPlacement; color: string; visible: (layer: string) => boolean };

/** A sheet drawn where its placement puts it: one LineSegments per visible layer. */
export function SheetObject({ sheet, placement, color, visible }: Props) {
  return (
    <group>
      {sheet.layers.map(
        (l) => visible(l.name) && <LayerLines key={l.name} segments={l.segments} placement={placement} color={color} />,
      )}
    </group>
  );
}

/** `placement` must be referentially stable, or the geometry is rebuilt on every render. */
function LayerLines({ segments, placement, color }: { segments: Float64Array; placement: SheetPlacement; color: string }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(sheetPositions(segments, placement), 3));
    return g;
  }, [segments, placement]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}
