// Design | Environment split (ADR 0001): one canvas, one camera, two scissored renders per frame.
// Objects choose their viewport by three.js layer: design = 0 (the default, so M1 content is unchanged),
// environment = 1, both = enable both.
import { useLayoutEffect } from 'react';
import { events as defaultEvents, useFrame, useThree, type RootState } from '@react-three/fiber';
import { CanvasTexture, Color, OrthographicCamera, PerspectiveCamera, SRGBColorSpace, Vector3, type Camera, type Object3D } from 'three';
import { drawnLayout, useUi } from '../state/ui';

export const DESIGN_LAYER = 0;
export const ENV_LAYER = 1;
export const ENV_BACKGROUND = '#f3f1ea';

export type Half = 'design' | 'env';

/** Ref callback: draw this object in both viewports. */
export const inBothViewports = (o: Object3D | null) => void o?.layers.enable(ENV_LAYER);

/** Width of each half in CSS px (left = design, right = environment); a closed viewport gets 0. */
const halves = (width: number) => {
  const layout = drawnLayout();
  const left = layout === 'both' ? Math.floor(width / 2) : layout === 'design' ? width : 0;
  return { left, right: width - left };
};
/** Width of the open viewport(s): the camera's frustum follows it. */
const viewWidth = (width: number) => {
  const { left, right } = halves(width);
  return left || right;
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
  const layout = useUi(drawnLayout);
  // Before effects that frame the view (fitToBox reads the frustum), not only on the next frame.
  useLayoutEffect(() => fitHalf(camera, viewWidth(size.width), size.height), [camera, size, layout]);

  useFrame(({ gl, scene, camera, size }) => {
    const { left, right } = halves(size.width);
    const h = size.height;
    // drei/r3f reset the frustum to full width on resize; keep it at the open viewport's width every frame.
    fitHalf(camera, left || right, h);
    const background = scene.background;
    gl.setScissorTest(true);
    if (left > 0) {
      gl.setViewport(0, 0, left, h);
      gl.setScissor(0, 0, left, h);
      camera.layers.set(DESIGN_LAYER);
      gl.render(scene, camera);
    }
    if (right > 0) {
      gl.setViewport(left, 0, right, h);
      gl.setScissor(left, 0, right, h);
      camera.layers.set(ENV_LAYER);
      scene.background = useUi.getState().clean ? skyTexture() : envBackground;
      gl.render(scene, camera);
      scene.background = background;
    }
    camera.layers.set(DESIGN_LAYER);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, h);
  }, 1);
}
const envBackground = new Color(ENV_BACKGROUND);

/** Clean view sky: zenith blue to a pale horizon (the fog colour), drawn once. */
export const HORIZON = '#dfe7ee';
let sky: CanvasTexture | undefined;
function skyTexture() {
  if (sky) return sky;
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7fa8d1');
  grad.addColorStop(0.75, HORIZON);
  grad.addColorStop(1, HORIZON);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  sky = new CanvasTexture(c);
  sky.colorSpace = SRGBColorSpace;
  return sky;
}

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
  // Design closed: keep its labels off screen.
  if (w === 0) return [-1e4, -1e4];
  return [((v.x + 1) * w) / 2, ((1 - v.y) * size.height) / 2];
}
