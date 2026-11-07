import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, SRGBColorSpace } from 'three';
import type { PdfRender } from '../pdf/render';
import { sheetToWorld, toScene, type HorizontalPlacement } from './coords';

/** The rendered PDF page on a quad spanning sheet (0, 0)…(w, h), drawn where its placement puts it. */
export function PdfObject({ render, placement }: { render: PdfRender; placement: HorizontalPlacement }) {
  const texture = useMemo(() => {
    const tex = new CanvasTexture(render.canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [render]);
  useEffect(() => () => texture.dispose(), [texture]);

  const geometry = useMemo(() => {
    const { w, h } = render.sheetM;
    const corners = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ] as const;
    const pos = new Float32Array(corners.flatMap(([x, y]) => toScene(...sheetToWorld(placement, x, y))));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    // Canvas row 0 is the page top; three's default flipY puts it at v = 1.
    g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, [render, placement]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
    </mesh>
  );
}
