import { Text } from '@react-three/drei';
import type { NormalizedText } from '../dwg/types';
import { layerColor } from '../project/layerGroups';
import { sheetToWorld, toScene, type SheetPlacement } from './coords';
import { FONT_URL } from './font';

// MTEXT attachment point 1–9 (1 = top left … 9 = bottom right) → troika anchors.
const ANCHOR_X = ['left', 'center', 'right'] as const;
// MTEXT top = cap line of the first line, bottom = baseline of the last (not troika's full line box).
// drei's anchorY type omits 'top-cap', which troika supports (troika-three-text Typesetter.js).
const ANCHOR_Y = ['top-cap', 'middle', 'bottom-baseline'] as unknown as ('top' | 'middle' | 'bottom-baseline')[];

/** fontSize / MTEXT height. Picked by eye (user, T8): between 1.0 (too small) and 1.4 (cap-height match, too big). */
const TEXT_SCALE = 1.2;

type Props = { texts: NormalizedText[]; placement: SheetPlacement; color: string; visible: (layer: string) => boolean };

/** Lifts texts this far off their sheet towards the viewer, so lines don't cut through them. */
const LIFT = 0.002;

/**
 * Plans: texts lie flat, text up = north. Vertical sheets: texts stand in the plane with their x along `dir`
 * and up = world up, so they face the viewer (−look) unmirrored. Scene rotation about +y by atan2(dir.y, dir.x)
 * takes local x to dir and local z (the text normal) to −look (PLAN.md §4).
 * Keys are the text's index, so hiding a layer doesn't re-create the others.
 */
export function SheetTexts({ texts, placement: p, color, visible }: Props) {
  const yaw = p.type === 'vertical' ? Math.atan2(p.dir.y, p.dir.x) : 0;
  // Horizontal sheets with a transform: texts turn and scale with it (scale > 0, so never mirrored).
  const turn = p.type === 'horizontal' ? (p.transform?.rotation ?? 0) : 0;
  const scale = p.type === 'horizontal' ? (p.transform?.scale ?? 1) : 1;
  // Towards the viewer: up on plans, −look = (dir.y, −dir.x) on vertical sheets.
  const lift: [number, number, number] =
    p.type === 'vertical' ? [p.dir.y * LIFT, -p.dir.x * LIFT, 0] : [0, 0, LIFT];
  return (
    <group>
      {texts.map((t, i) => {
        if (!visible(t.layer)) return null;
        const a = Math.min(Math.max(t.attach, 1), 9) - 1;
        const [x, y, z] = sheetToWorld(p, t.x, t.y);
        return (
          <Text
            key={i}
            position={toScene(x + lift[0], y + lift[1], z + lift[2])}
            // Plan: flat (text up = north), then the MTEXT rotation about the vertical axis.
            // Vertical: in-plane MTEXT rotation first (local z), then the yaw onto the plane.
            rotation={p.type === 'vertical' ? [0, yaw, t.rotation, 'YXZ'] : [-Math.PI / 2, t.rotation + turn, 0, 'YXZ']}
            font={FONT_URL}
            fontSize={t.height * TEXT_SCALE * scale}
            anchorX={ANCHOR_X[a % 3]}
            anchorY={ANCHOR_Y[Math.floor(a / 3)]}
            color={layerColor(t.layer, color)}
          >
            {t.text}
          </Text>
        );
      })}
    </group>
  );
}
