// MTEXT inline formatting → plain text. Pure.
// Codes per AutoCAD's MTEXT format-code list. The real files only use \f…; \W…; and \L (checked 2026-11-07).

const BS = '\u0000';
const LB = '\u0001';
const RB = '\u0002';

/** Plain text, plus whether unknown `\` codes were left in it (shown in the UI as a count). */
export function stripMtext(raw: string): { text: string; leftover: boolean } {
  let s = raw.replace(/\\\\/g, BS).replace(/\\\{/g, LB).replace(/\\\}/g, RB);
  s = s
    .replace(/\\[fFWHCcQTApa][^;]*;/g, '') // font, width, height, colour, oblique, tracking, alignment, paragraph
    .replace(/\\S([^;]*);/g, (_, f: string) => f.replace(/[#^]/g, '/')) // stacked fraction 1/2, 1#2, 1^2
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[LlOoKk]/g, '') // underline, overline, strike-through on/off
    .replace(/\\P/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, '');
  s = decodePercent(s);
  const leftover = /\\[A-Za-z]/.test(s);
  return { text: s.replace(new RegExp(BS, 'g'), '\\').replace(new RegExp(LB, 'g'), '{').replace(new RegExp(RB, 'g'), '}'), leftover };
}

/** %%c ⌀, %%d °, %%p ±, %%% % (TEXT and MTEXT). */
export function decodePercent(s: string): string {
  return s.replace(/%%([cdp%])/gi, (_, c: string) => ({ c: '⌀', d: '°', p: '±', '%': '%' })[c.toLowerCase()] ?? c);
}
