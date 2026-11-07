// Kind/z suggestion from the filename (PLAN.md M1a). The user confirms or fixes it once in the sheet list.
import type { SourceFile } from './folder';
import type { SheetKind } from './projectFile';

export type Suggestion = { kind: SheetKind; z?: number };

// Default storey heights in m rel. ±0.00 (PLAN.md §1: attic floor +3.29, ridge +9.12).
const PLAN_Z: [word: string, z: number][] = [
  ['PARTERU', 0],
  ['PODDASZA', 3.29],
  ['DACHU', 9.12],
];

// macOS may hand us NFD names ("PRZEKRÓJ" as O + combining accent), so compare in NFC, upper case.
const norm = (name: string) => name.normalize('NFC').toLocaleUpperCase('pl');

export function suggest(file: SourceFile): Suggestion {
  if (file.type === 'pdf') return { kind: 'pdf' };
  const n = norm(file.name);
  if (n.includes('RZUT')) return { kind: 'plan', z: PLAN_Z.find(([w]) => n.includes(w))?.[1] ?? 0 };
  if (n.includes('ELEWACJA')) return { kind: 'elevation' };
  if (n.includes('PRZEKRÓJ')) return { kind: 'section' };
  if (n.includes('ZAGOSPODAROWANIA')) return { kind: 'site' };
  return { kind: 'detail' };
}
