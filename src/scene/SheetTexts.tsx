import { Text } from '@react-three/drei';
import type { NormalizedText } from '../dwg/types';
import { toScene } from './coords';
import { FONT_URL } from './font';

// MTEXT attachment point 1–9 (1 = top left … 9 = bottom right) → troika anchors.
const ANCHOR_X = ['left', 'center', 'right'] as const;
const ANCHOR_Y = ['top', 'middle', 'bottom'] as const;

/** Plan texts lying flat at z. MTEXT height ≈ cap height; Noto Sans cap height is 0.714 em. */
export function SheetTexts({ texts, z, color }: { texts: NormalizedText[]; z: number; color: string }) {
  return (
    <group>
      {texts.map((t, i) => {
        const a = Math.min(Math.max(t.attach, 1), 9) - 1;
        return (
          <Text
            key={i}
            position={toScene(t.x, t.y, z + 0.002)}
            // Flat on the plan (text up = north), then the MTEXT rotation about the vertical axis.
            rotation={[-Math.PI / 2, t.rotation, 0, 'YXZ']}
            font={FONT_URL}
            fontSize={t.height / 0.714}
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
