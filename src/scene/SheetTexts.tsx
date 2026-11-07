import { Text } from '@react-three/drei';
import type { NormalizedText } from '../dwg/types';
import { toScene } from './coords';
import { FONT_URL } from './font';

// MTEXT attachment point 1–9 (1 = top left … 9 = bottom right) → troika anchors.
const ANCHOR_X = ['left', 'center', 'right'] as const;
// MTEXT top = cap line of the first line, bottom = baseline of the last (not troika's full line box).
// drei's anchorY type omits 'top-cap', which troika supports (troika-three-text Typesetter.js).
const ANCHOR_Y = ['top-cap', 'middle', 'bottom-baseline'] as unknown as ('top' | 'middle' | 'bottom-baseline')[];

/** fontSize / MTEXT height. Picked by eye (user, T8): between 1.0 (too small) and 1.4 (cap-height match, too big). */
const TEXT_SCALE = 1.2;

type Props = { texts: NormalizedText[]; z: number; color: string; visible: (layer: string) => boolean };

/** Plan texts lying flat at z. Keys are the text's index, so hiding a layer doesn't re-create the others. */
export function SheetTexts({ texts, z, color, visible }: Props) {
  return (
    <group>
      {texts.map((t, i) => {
        if (!visible(t.layer)) return null;
        const a = Math.min(Math.max(t.attach, 1), 9) - 1;
        return (
          <Text
            key={i}
            position={toScene(t.x, t.y, z + 0.002)}
            // Flat on the plan (text up = north), then the MTEXT rotation about the vertical axis.
            rotation={[-Math.PI / 2, t.rotation, 0, 'YXZ']}
            font={FONT_URL}
            fontSize={t.height * TEXT_SCALE}
            anchorX={ANCHOR_X[a % 3]}
            anchorY={ANCHOR_Y[Math.floor(a / 3)]}
            color={color}
          >
            {t.text}
          </Text>
        );
      })}
    </group>
  );
}
