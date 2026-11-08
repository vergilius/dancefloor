// ±0.00 reference and height formatting (PLAN.md §5 M2). Pure.

/** Reference values on different sheets agree within this (m). */
const AGREE_TOL = 0.001;

export type LevelReference =
  | { ok: true; value: number; sheets: number }
  | { ok: false; reason: 'none' }
  | { ok: false; reason: 'disagree'; values: { file: string; value: number }[] };

/** The value every `0,00= … m npm` label agrees on, over all parsed sheets. */
export function levelReference(sheets: { file: string; references: number[] }[]): LevelReference {
  const values = sheets.flatMap((s) => s.references.map((value) => ({ file: s.file, value })));
  if (values.length === 0) return { ok: false, reason: 'none' };
  const first = values[0]!.value;
  if (values.some((v) => Math.abs(v.value - first) > AGREE_TOL)) return { ok: false, reason: 'disagree', values };
  return { ok: true, value: first, sheets: new Set(values.map((v) => v.file)).size };
}

/** `+3.29`, `−0.32`, `±0.00` (typographic minus, like the drawings). */
export function formatRel(rel: number, digits = 2): string {
  const s = Math.abs(rel).toFixed(digits);
  if (Number(s) === 0) return `±${s}`;
  return `${rel < 0 ? '−' : '+'}${s}`;
}

/** `+3.29 (358.69 m n.p.m.)`; relative only without a reference. The one formatter for every shown height. */
export function formatHeight(rel: number, ref: number | undefined, digits = 2): string {
  return ref === undefined ? formatRel(rel, digits) : `${formatRel(rel, digits)} (${(ref + rel).toFixed(digits)} m n.p.m.)`;
}
