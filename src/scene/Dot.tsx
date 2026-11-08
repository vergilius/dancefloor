import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { toScene } from './coords';
import type { Vec3 } from './snap';

/** A screen-sized dot at a world point (x, y, z), drawn over everything. */
export function Dot({ p, color, size }: { p: Vec3; color: string; size: number }) {
  const [x, y, z] = p;
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(toScene(x, y, z)), 3));
    return g;
  }, [x, y, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry} renderOrder={10}>
      <pointsMaterial color={color} size={size} sizeAttenuation={false} depthTest={false} />
    </points>
  );
}
