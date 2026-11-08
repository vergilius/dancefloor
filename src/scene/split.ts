// Design | Environment split (ADR 0001): one canvas, one camera, two scissored renders per frame.
// Objects choose their viewport by three.js layer: design = 0 (the default, so M1 content is unchanged),
// environment = 1, both = enable both.
import { useLayoutEffect } from 'react';
import { events as defaultEvents, useFrame, useThree, type RootState } from '@react-three/fiber';
import { Color, OrthographicCamera, PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three';

export const DESIGN_LAYER = 0;
export const ENV_LAYER = 1;
export const ENV_BACKGROUND = '#f3f1ea';

export type Half = 'design' | 'env';

/** Ref callback: draw this object in both viewports. */
export const inBothViewports = (o: Object3D | null) => void o?.layers.enable(ENV_LAYER);

/** Width of each half in CSS px (left = design, right = environment). */
const halves = (width: number) => {
  const left = Math.floor(width / 2);
  return { left, right: width - left };
};

/** The camera's projection for one half: perspective aspect, or the ortho frustum in px (as drei sets it, at half width). */
function fitHalf(camera: Camera, width: number, height: number) {
  if (camera instanceof PerspectiveCamera) {
    if (camera.aspect === width / height) return;
    camera.aspect = width / height;
  } else if (camera instanceof OrthographicCamera) {
    if (camera.right - camera.left === width && camera.top - camera.bottom === height) return;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
  } else return;
  camera.updateProjectionMatrix();
}

/** Takes over rendering (useFrame priority 1). Place it after the camera so its layout effect runs after drei's. */
export function useSplitRender() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // Before effects that frame the view (fitToBox reads the frustum), not only on the next frame.
  useLayoutEffect(() => fitHalf(camera, halves(size.width).left, size.height), [camera, size]);

  useFrame(({ gl, scene, camera, size }) => {
    const { left, right } = halves(size.width);
    const h = size.height;
    // drei/r3f reset the frustum to full width on resize; keep it at half width every frame.
    fitHalf(camera, left, h);
    const background = scene.background;
    gl.setScissorTest(true);
    gl.setViewport(0, 0, left, h);
    gl.setScissor(0, 0, left, h);
    camera.layers.set(DESIGN_LAYER);
    gl.render(scene, camera);
    gl.setViewport(left, 0, right, h);
    gl.setScissor(left, 0, right, h);
    camera.layers.set(ENV_LAYER);
    scene.background = envBackground;
    gl.render(scene, camera);
    scene.background = background;
    camera.layers.set(DESIGN_LAYER);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, h);
  }, 1);
}
const envBackground = new Color(ENV_BACKGROUND);

/** Which half a client point is in, and the pointer in that half's NDC. */
export function halfAt(clientX: number, clientY: number, rect: DOMRect): { half: Half; ndc: [number, number] } {
  const { left, right } = halves(rect.width);
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const env = x >= left;
  const nx = env ? (x - left) / right : x / left;
  return { half: env ? 'env' : 'design', ndc: [nx * 2 - 1, -(y / rect.height) * 2 + 1] };
}

/** r3f events: the pointer maps into the half under it, and the raycaster only sees that half's layer. */
export function splitEvents(store: Parameters<typeof defaultEvents>[0]) {
  return {
    ...defaultEvents(store),
    compute(event: { clientX: number; clientY: number }, state: RootState) {
      const el = (state.events.connected as HTMLElement | undefined) ?? state.gl.domElement;
      const { half, ndc } = halfAt(event.clientX, event.clientY, el.getBoundingClientRect());
      state.pointer.set(...ndc);
      state.raycaster.setFromCamera(state.pointer, state.camera);
      state.raycaster.layers.set(half === 'env' ? ENV_LAYER : DESIGN_LAYER);
    },
  };
}

const v = new Vector3();
/** drei `Html` positions over the full canvas; this one maps into the design half. */
export function designHtmlPosition(el: Object3D, camera: Camera, size: { width: number; height: number }): [number, number] {
  v.setFromMatrixPosition(el.matrixWorld).project(camera);
  const w = halves(size.width).left;
  return [((v.x + 1) * w) / 2, ((1 - v.y) * size.height) / 2];
}
