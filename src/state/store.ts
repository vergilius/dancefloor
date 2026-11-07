// App state: the open project folder, its sheets (saved or suggested) and per-file parse results.
import { create } from 'zustand';
import { listSourceFiles, type SourceFile } from '../project/folder';
import { readProjectFile, writeProjectFile, type Sheet, type SheetKind } from '../project/projectFile';
import { suggest } from '../project/suggest';
import { parseDwg } from '../worker/client';
import type { ParseSummary } from '../worker/protocol';

/** `saved` = confirmed in dancefloor.json; `suggested` = from the filename, not saved yet. */
export type SheetRow = Sheet & { type?: SourceFile['type']; source: 'saved' | 'suggested'; missing: boolean };

export type ParseState =
  | { status: 'parsing' }
  | { status: 'done'; summary: ParseSummary }
  | { status: 'error'; message: string };

type ProjectState = {
  dir?: FileSystemDirectoryHandle;
  sheets: SheetRow[];
  dirty: boolean;
  /** dancefloor.json exists but couldn't be read. Saving is blocked so we don't overwrite it. */
  loadError?: string;
  saveError?: string;
  parsed: Record<string, ParseState>;
  open(dir: FileSystemDirectoryHandle): Promise<void>;
  setKind(file: string, kind: SheetKind): void;
  setZ(file: string, z: number): void;
  save(): Promise<void>;
  parse(file: string): Promise<void>;
};

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

  async open(dir) {
    const files = await listSourceFiles(dir);
    let saved: Sheet[] = [];
    let loadError: string | undefined;
    try {
      saved = (await readProjectFile(dir))?.sheets ?? [];
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
    set({ dir, sheets, dirty: false, loadError, saveError: undefined, parsed: {} });
  },

  setKind(file, kind) {
    set((st) => ({
      dirty: true,
      sheets: edit(st.sheets, file, ({ placement, ...r }) => {
        if (kind !== 'plan') return { ...r, kind };
        const z = placement?.z ?? (r.type ? suggest({ name: file, type: r.type }).z : undefined) ?? 0;
        return { ...r, kind, placement: { type: 'horizontal', z } };
      }),
    }));
  },

  setZ(file, z) {
    set((st) => ({
      dirty: true,
      sheets: edit(st.sheets, file, (r) => ({ ...r, placement: { type: 'horizontal', z } })),
    }));
  },

  async save() {
    const { dir, sheets, loadError } = get();
    if (!dir || loadError) return;
    const out: Sheet[] = sheets.map(({ file, kind, placement }) => ({ file, kind, ...(placement && { placement }) }));
    try {
      await writeProjectFile(dir, { version: 1, sheets: out });
      set((st) => ({
        dirty: false,
        saveError: undefined,
        sheets: st.sheets.map((r) => ({ ...r, source: 'saved' })),
      }));
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
