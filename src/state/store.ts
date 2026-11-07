// App state: the open project folder, its sheets (saved or suggested) and per-file parse results.
import { create } from 'zustand';
import { listSourceFiles, type SourceFile } from '../project/folder';
import { DEFAULT_GROUPS, type GroupId, type Groups } from '../project/layerGroups';
import { readProjectFile, writeProjectFile, type Sheet, type SheetKind } from '../project/projectFile';
import { suggest } from '../project/suggest';
import type { VerticalPlacement } from '../project/vertical';
import { parseDwg } from '../worker/client';
import type { ParseSummary } from '../worker/protocol';

/** `saved` = confirmed in dancefloor.json; `suggested` = from the filename, not saved yet. */
export type SheetRow = Sheet & { type?: SourceFile['type']; source: 'saved' | 'suggested'; missing: boolean };

export type ParseState =
  | { status: 'parsing' }
  | { status: 'done'; summary: ParseSummary }
  | { status: 'error'; message: string };

export type ProjectState = {
  dir?: FileSystemDirectoryHandle;
  sheets: SheetRow[];
  dirty: boolean;
  /** dancefloor.json exists but couldn't be read. Saving is blocked so we don't overwrite it. */
  loadError?: string;
  saveError?: string;
  parsed: Record<string, ParseState>;
  /** Layer groups, project-wide (T9). */
  groups: Groups;
  open(dir: FileSystemDirectoryHandle): Promise<void>;
  setKind(file: string, kind: SheetKind): void;
  setZ(file: string, z: number): void;
  /** Elevations/sections: sets the (edited) placement, which then wins over the derived one. */
  setVertical(file: string, placement: VerticalPlacement): void;
  /** Elevations/sections: drops the saved placement, so it is derived again. */
  resetVertical(file: string): void;
  setGroup(group: GroupId, visible: boolean): void;
  setLayer(file: string, layer: string, visible: boolean): void;
  /** `derived`: placements of vertical sheets with none saved yet, written with them. */
  save(derived?: Record<string, VerticalPlacement>): Promise<void>;
  parse(file: string): Promise<void>;
};

/** Kinds parsed as soon as the folder opens (or the kind is chosen): they are placed in 3D. */
const AUTO_PARSE = new Set<SheetKind>(['plan', 'elevation', 'section']);

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function fromSuggestion(f: SourceFile): SheetRow {
  const s = suggest(f);
  return {
    file: f.name,
    type: f.type,
    kind: s.kind,
    ...(s.kind === 'plan' && { placement: { type: 'horizontal', z: s.z ?? 0 } }),
    source: 'suggested',
    missing: false,
  };
}

function edit(rows: SheetRow[], file: string, change: (r: SheetRow) => SheetRow): SheetRow[] {
  return rows.map((r) => (r.file === file ? change(r) : r));
}

export const useProject = create<ProjectState>()((set, get) => ({
  sheets: [],
  dirty: false,
  parsed: {},
  groups: DEFAULT_GROUPS,

  async open(dir) {
    const files = await listSourceFiles(dir);
    let saved: Sheet[] = [];
    let groups = DEFAULT_GROUPS;
    let loadError: string | undefined;
    try {
      const project = await readProjectFile(dir);
      saved = project?.sheets ?? [];
      groups = { ...DEFAULT_GROUPS, ...project?.groups };
    } catch (err) {
      loadError = errText(err);
    }
    const byFile = new Map(saved.map((s) => [s.file, s]));
    const present = new Set(files.map((f) => f.name));
    const sheets: SheetRow[] = [
      ...files.map((f) => {
        const s = byFile.get(f.name);
        return s ? { ...s, type: f.type, source: 'saved' as const, missing: false } : fromSuggestion(f);
      }),
      // Saved sheets whose file is gone stay in the project (and in the next save) so nothing is lost silently.
      ...saved.filter((s) => !present.has(s.file)).map((s) => ({ ...s, source: 'saved' as const, missing: true })),
    ];
    set({ dir, sheets, groups, dirty: false, loadError, saveError: undefined, parsed: {} });
    // Plans and vertical sheets are placed in 3D, so parse them right away. The worker handles one file at a time.
    for (const s of sheets) if (AUTO_PARSE.has(s.kind) && s.type === 'dwg' && !s.missing) void get().parse(s.file);
  },

  setKind(file, kind) {
    set((st) => ({
      dirty: true,
      sheets: edit(st.sheets, file, ({ placement, ...r }) => {
        if (kind !== 'plan') return { ...r, kind };
        const z = (placement?.type === 'horizontal' ? placement.z : undefined) ?? (r.type ? suggest({ name: file, type: r.type }).z : undefined) ?? 0;
        return { ...r, kind, placement: { type: 'horizontal', z } };
      }),
    }));
    const row = get().sheets.find((r) => r.file === file);
    if (AUTO_PARSE.has(kind) && row?.type === 'dwg' && !row.missing && !get().parsed[file]) void get().parse(file);
  },

  setZ(file, z) {
    set((st) => ({
      dirty: true,
      sheets: edit(st.sheets, file, (r) => ({ ...r, placement: { type: 'horizontal', z } })),
    }));
  },

  setVertical(file, placement) {
    set((st) => ({ dirty: true, sheets: edit(st.sheets, file, (r) => ({ ...r, placement })) }));
  },

  resetVertical(file) {
    set((st) => ({ dirty: true, sheets: edit(st.sheets, file, (r) => ({ ...r, placement: undefined })) }));
  },

  setGroup(group, visible) {
    set((st) => ({ dirty: true, groups: { ...st.groups, [group]: visible } }));
  },

  setLayer(file, layer, visible) {
    set((st) => ({
      dirty: true,
      sheets: edit(st.sheets, file, (r) => {
        // Store only layers that are off; turning one back on removes its entry.
        const layers = Object.fromEntries(Object.entries(r.layers ?? {}).filter(([name]) => name !== layer));
        if (!visible) layers[layer] = { visible: false };
        return { ...r, layers };
      }),
    }));
  },

  async save(derived = {}) {
    const { dir, groups, loadError } = get();
    if (!dir || loadError) return;
    const sheets = get().sheets.map((r) => (!r.placement && derived[r.file] ? { ...r, placement: derived[r.file] } : r));
    const out: Sheet[] = sheets.map(({ file, kind, placement, layers }) => ({
      file,
      kind,
      ...(placement && { placement }),
      ...(layers && Object.keys(layers).length > 0 && { layers }),
    }));
    try {
      await writeProjectFile(dir, { version: 1, sheets: out, groups });
      // Keep the written placements on the rows, so they are used (not re-derived) from now on.
      set({ dirty: false, saveError: undefined, sheets: sheets.map((r) => ({ ...r, source: 'saved' })) });
    } catch (err) {
      set({ saveError: errText(err) });
    }
  },

  async parse(file) {
    const { dir } = get();
    if (!dir) return;
    const setP = (p: ParseState) => {
      if (get().dir === dir) set((st) => ({ parsed: { ...st.parsed, [file]: p } }));
    };
    setP({ status: 'parsing' });
    try {
      const bytes = await (await (await dir.getFileHandle(file)).getFile()).arrayBuffer();
      setP({ status: 'done', summary: await parseDwg(file, bytes) });
    } catch (err) {
      setP({ status: 'error', message: errText(err) });
    }
  },
}));
