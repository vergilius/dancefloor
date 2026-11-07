// The project JSON (`dancefloor.json`) next to the DWGs: our own source of truth (PLAN.md §2, §4).
// Sheets are referenced by filename. Fields from §4 that later tasks need (transform) are added when
// those tasks land; unknown fields are rejected, not guessed.
import { GROUP_IDS, type GroupId, type Groups, type LayerOverrides } from './layerGroups';
import type { VerticalPlacement } from './vertical';

export const PROJECT_FILE = 'dancefloor.json';

export const SHEET_KINDS = ['plan', 'elevation', 'section', 'site', 'pdf', 'detail'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

export type Placement = { type: 'horizontal'; z: number };

export type Sheet = {
  file: string;
  kind: SheetKind;
  /** Plans: horizontal (m rel. ±0.00). Elevations/sections: vertical, saved once derived (M1b). */
  placement?: Placement | VerticalPlacement;
  /** Only layers the user turned off (T9). */
  layers?: LayerOverrides;
};

export type ProjectFile = { version: 1; sheets: Sheet[]; groups?: Partial<Groups> };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isVec2 = (v: unknown): v is { x: number; y: number } => isObj(v) && Number.isFinite(v.x) && Number.isFinite(v.y);

function parsePlacement(p: unknown, kind: SheetKind, where: string): Placement | VerticalPlacement {
  if (kind === 'plan') {
    if (!isObj(p) || p.type !== 'horizontal' || !Number.isFinite(p.z)) throw new Error(`${where}: expected { type: "horizontal", z: number }`);
    return { type: 'horizontal', z: p.z as number };
  }
  if (kind === 'elevation' || kind === 'section') {
    if (!isObj(p) || p.type !== 'vertical' || !isVec2(p.origin) || !isVec2(p.dir) || Math.abs(Math.hypot(p.dir.x, p.dir.y) - 1) > 1e-6)
      throw new Error(`${where}: expected { type: "vertical", origin: { x, y }, dir: unit { x, y } }`);
    return { type: 'vertical', origin: { x: p.origin.x, y: p.origin.y }, dir: { x: p.dir.x, y: p.dir.y } };
  }
  throw new Error(`${where}: a ${kind} sheet has no placement`);
}

function parseSheet(v: unknown, i: number): Sheet {
  const where = `sheets[${i}]`;
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  const { file, kind, placement, layers } = v;
  if (typeof file !== 'string' || !file) throw new Error(`${where}.file: expected a filename`);
  if (!SHEET_KINDS.includes(kind as SheetKind)) throw new Error(`${where}.kind: unknown "${String(kind)}"`);
  const sheet: Sheet = { file, kind: kind as SheetKind };
  if (placement !== undefined) sheet.placement = parsePlacement(placement, sheet.kind, `${where}.placement`);
  if (layers !== undefined) {
    if (!isObj(layers)) throw new Error(`${where}.layers: expected an object`);
    sheet.layers = {};
    for (const [name, l] of Object.entries(layers)) {
      if (!isObj(l) || typeof l.visible !== 'boolean') throw new Error(`${where}.layers["${name}"]: expected { visible: boolean }`);
      sheet.layers[name] = { visible: l.visible };
    }
  }
  return sheet;
}

export function parseProjectFile(text: string): ProjectFile {
  const v: unknown = JSON.parse(text);
  if (!isObj(v)) throw new Error('not a JSON object');
  if (v.version !== 1) throw new Error(`unsupported version ${String(v.version)} (expected 1)`);
  if (!Array.isArray(v.sheets)) throw new Error('sheets: expected an array');
  const project: ProjectFile = { version: 1, sheets: v.sheets.map(parseSheet) };
  if (v.groups !== undefined) {
    if (!isObj(v.groups)) throw new Error('groups: expected an object');
    project.groups = {};
    for (const [g, on] of Object.entries(v.groups)) {
      if (!GROUP_IDS.includes(g as GroupId) || typeof on !== 'boolean') throw new Error(`groups.${g}: unknown group or not a boolean`);
      project.groups[g as GroupId] = on;
    }
  }
  return project;
}

/** The saved project, or undefined if the folder has none yet. */
export async function readProjectFile(dir: FileSystemDirectoryHandle): Promise<ProjectFile | undefined> {
  let handle: FileSystemFileHandle;
  try {
    handle = await dir.getFileHandle(PROJECT_FILE);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return undefined;
    throw err;
  }
  const text = await (await handle.getFile()).text();
  try {
    return parseProjectFile(text);
  } catch (err) {
    throw new Error(`${PROJECT_FILE}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

export async function writeProjectFile(dir: FileSystemDirectoryHandle, project: ProjectFile): Promise<void> {
  const handle = await dir.getFileHandle(PROJECT_FILE, { create: true });
  const out = await handle.createWritable();
  try {
    await out.write(JSON.stringify(project, null, 2) + '\n');
  } catch (err) {
    await out.abort(); // keep the previous file instead of committing a partial one
    throw err;
  }
  await out.close();
}
