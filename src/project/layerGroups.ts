// Layer groups (M1a T9): one toggle hides e.g. all "details" on every sheet. Layer names are the Revit AIA
// names found in PAB-01..03 (PLAN.md §1). First matching rule wins; unmatched layers go to `other`.
import { DOOR_SWING_LAYER } from '../dwg/layers';

export const GROUP_IDS = ['layout', 'levels', 'grid', 'obstacles', 'details', 'other'] as const;
export type GroupId = (typeof GROUP_IDS)[number];
export type Groups = Record<GroupId, boolean>;

/** Details start hidden (PLAN.md §1 noise layers are all in it). */
export const DEFAULT_GROUPS: Groups = { layout: true, levels: true, grid: true, obstacles: true, details: false, other: true };

/** Obstacles (PLAN.md §5 M1c): utilities and the rainwater tank (`A-DETL-2`), checked before `details`. */
const RULES: [GroupId, string[]][] = [
  ['levels', ['G-ANNO-DIMS*']],
  ['grid', ['S-GRID*']],
  ['obstacles', ['PZT_GAZ*', 'PZT_WODA P', 'PZT_KAN*', 'PZT_PRĄD', 'A-DETL-2']],
  ['details', ['*-IDEN*', '*-ANNO*', '*-PATT*', '*-HDLN*', DOOR_SWING_LAYER]],
  ['layout', ['A-WALL*', 'I-WALL*', 'A-DOOR*', 'A-GLAZ*', 'S-COLS*', 'S-STRS*', 'A-FLOR-HRAL*', 'A-ROOF*']],
  ['details', ['G-ANNO-*', 'I-FURN*', 'P-SANR-*', 'Q-SPCQ*', 'A-DETL-*', 'A-AREA*', 'PZT_WYMIARY*', 'PZT_OPIS*']],
];

const glob = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
const COMPILED = RULES.map(([g, ps]) => [g, ps.map(glob)] as const);
const cache = new Map<string, GroupId>();

export function groupOf(layer: string): GroupId {
  let g = cache.get(layer);
  if (!g) {
    g = COMPILED.find(([, res]) => res.some((re) => re.test(layer)))?.[0] ?? 'other';
    cache.set(layer, g);
  }
  return g;
}

/** Every obstacle layer is drawn in this one warning colour, whatever the sheet's colour. */
export const OBSTACLE_COLOR = '#ff6a00';
export const layerColor = (layer: string, sheetColor: string) =>
  groupOf(layer) === 'obstacles' ? OBSTACLE_COLOR : sheetColor;

/** Per-sheet layer overrides; a layer not listed is visible (its group still decides). */
export type LayerOverrides = Record<string, { visible: boolean }>;

export const layerVisible = (groups: Groups, layers: LayerOverrides | undefined, name: string) =>
  groups[groupOf(name)] && layers?.[name]?.visible !== false;
