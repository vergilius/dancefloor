// Contour lines on the height grid (PLAN.md §5 M3): marching squares over the cell corners. Pure.
import { cellOutside, isOutside, type HeightGrid } from './grid';

/** Contour interval (m); every MAJOR_EVERY-th level (a whole metre) is a major contour. */
export const CONTOUR_STEP = 0.25;
const MAJOR_EVERY = 4;

/** Plan segments [x1, y1, x2, y2, …] at height `h`; one entry per level that crosses the grid. */
export type Contour = { h: number; major: boolean; segs: Float64Array };

/**
 * Contours every `step` m over the grid. Cells with an uncertain corner (flat extrapolation outside the
 * profiles' hull) are skipped: their "relief" is an artefact. Saddles are resolved by the cell-centre average.
 */
export function contours(g: HeightGrid, step = CONTOUR_STEP): Contour[] {
  const w = g.cols + 1;
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < g.base.length; k++) {
    if (g.uncertain[k] || isOutside(g, k)) continue;
    min = Math.min(min, g.base[k]!);
    max = Math.max(max, g.base[k]!);
  }
  if (!(max > min)) return [];
  const out: Contour[] = [];
  // Levels as integer multiples of `step`, so 1 m levels are exact (−2, −1, 0, …) and comparisons don't drift.
  for (let n = Math.ceil(min / step); n * step <= max; n++) {
    const h = n * step;
    const segs: number[] = [];
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const a = j * w + i; // SW
        const b = a + 1; //     SE
        const d = a + w; //     NW
        const e = d + 1; //     NE
        if (g.uncertain[a]! | g.uncertain[b]! | g.uncertain[d]! | g.uncertain[e]! || cellOutside(g, a)) continue;
        const ha = g.base[a]!, hb = g.base[b]!, hd = g.base[d]!, he = g.base[e]!;
        // Corner "above" = h ≥ level; a corner exactly on the level counts as above (no double crossings).
        const code = (ha >= h ? 1 : 0) | (hb >= h ? 2 : 0) | (he >= h ? 4 : 0) | (hd >= h ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const x0 = g.origin.x + i * g.cell;
        const y0 = g.origin.y + j * g.cell;
        const c = g.cell;
        // Edge crossings: S (a–b), E (b–e), N (d–e), W (a–d).
        const S = (): [number, number] => [x0 + c * frac(ha, hb, h), y0];
        const E = (): [number, number] => [x0 + c, y0 + c * frac(hb, he, h)];
        const N = (): [number, number] => [x0 + c * frac(hd, he, h), y0 + c];
        const W = (): [number, number] => [x0, y0 + c * frac(ha, hd, h)];
        const seg = (p: [number, number], q: [number, number]) => segs.push(p[0], p[1], q[0], q[1]);
        switch (code) {
          case 1: case 14: seg(W(), S()); break;
          case 2: case 13: seg(S(), E()); break;
          case 3: case 12: seg(W(), E()); break;
          case 4: case 11: seg(E(), N()); break;
          case 6: case 9: seg(S(), N()); break;
          case 7: case 8: seg(W(), N()); break;
          case 5: case 10: {
            // Saddle: SW and NE on one side. If the centre is on their side, they connect through the middle.
            const centreAbove = (ha + hb + hd + he) / 4 >= h;
            const swAbove = code === 5;
            if (centreAbove === swAbove) {
              seg(W(), N());
              seg(S(), E());
            } else {
              seg(W(), S());
              seg(E(), N());
            }
            break;
          }
        }
      }
    }
    if (segs.length) out.push({ h, major: n % MAJOR_EVERY === 0, segs: Float64Array.from(segs) });
  }
  return out;
}

/** Where `h` lies between p and q (0…1). Only called on edges the level crosses, so p ≠ q. */
const frac = (p: number, q: number, h: number) => (h - p) / (q - p);
