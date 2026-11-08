// WASD pans the shared camera (both halves) in the ground plane: W / S along the view direction, A / D sideways.
// Speed follows the zoom (a fraction of the visible size per second), Shift ×3. Ignored while typing in a field or
// with Ctrl / Cmd / Alt held (undo and other shortcuts).
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import { OrthographicCamera } from 'three';
import type { ComponentRef } from 'react';

type Controls = ComponentRef<typeof CameraControls>;

const KEYS = new Set(['w', 'a', 's', 'd']);
/** Visible size (m) crossed per second. */
const RATE = 0.6;
const FAST = 3;
/** Perspective: never slower than for this distance (m), e.g. after zooming into the house. */
const MIN_DIST = 5;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

export function KeyPan() {
  const down = useRef(new Set<string>());
  const fast = useRef(false);
  const controls = useThree((s) => s.controls) as Controls | null;

  useEffect(() => {
    const held = down.current;
    const onDown = (e: KeyboardEvent) => {
      fast.current = e.shiftKey;
      const k = e.key.toLowerCase();
      if (!KEYS.has(k) || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      held.add(k);
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      fast.current = e.shiftKey;
      held.delete(e.key.toLowerCase());
    };
    const clear = () => held.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useFrame(({ camera, size }, dt) => {
    const held = down.current;
    if (!controls || held.size === 0) return;
    const fwd = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
    const side = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
    if (!fwd && !side) return;
    const visible = camera instanceof OrthographicCamera ? size.height / camera.zoom : Math.max(controls.distance, MIN_DIST);
    const step = visible * RATE * Math.min(dt, 0.1) * (fast.current ? FAST : 1);
    const len = Math.hypot(fwd, side);
    if (fwd) void controls.forward((fwd / len) * step, false);
    if (side) void controls.truck((side / len) * step, 0, false);
  });

  return null;
}
