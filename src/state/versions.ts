// Edit versions (PLAN.md §5 M4a, ADR 0003): frozen snapshots of the generated terrain, stored as
// `dancefloor-versions/<id>.json` + `<id>.bin` in the project folder. Environment shows either the live
// generated terrain ("Podgląd") or the active version.
import { create } from 'zustand';
import { listFiles, readFile, removeFile, versionsDir, writeFile } from '../project/folder';
import type { HeightGrid } from '../terrain/grid';
import { replay, withValue, type Edit, type EditVolume, type Rect, type Tool } from '../versions/edits';
import { packGrid, parseVersionFile, serializeVersionFile, unpackGrid, type VersionFile } from '../versions/file';
import { useTerrain, type Terrain } from './terrain';

export type Version = { id: string; name: string; created: string; grid: HeightGrid; edits: Edit[]; fileVersion: VersionFile['version'] };
/** A version file that couldn't be read: listed with the reason, never deleted or overwritten. */
export type BrokenVersion = { file: string; error: string };
export type Active = 'preview' | string;
/** The JSON is written this long after the last change (PLAN.md §5 M4a). */
const AUTOSAVE_MS = 1000;

type VersionsState = {
  dir?: FileSystemDirectoryHandle;
  versions: Version[];
  broken: BrokenVersion[];
  active: Active;
  /** Edit tool armed in the active version (none in Podgląd). */
  tool?: Tool;
  /** The rect being dragged with the tool (plan m, on the lattice), shown with its size. View state. */
  draft?: Rect;
  /** Edit of the active version selected in the list (outlined in the view). View state. */
  selected?: string;
  /** Undo / redo per version: edit lists before each command. Not saved; cleared on folder load. */
  history: Record<string, { undo: Edit[][]; redo: Edit[][] }>;
  /** "Różnice": colour the version's surface by Δh against its frozen base. View state. */
  showDiff: boolean;
  /** Versions with changes not written yet. */
  unsaved: string[];
  /** Last failed write (create / rename / delete / autosave). Cleared by the next successful one. */
  saveError?: string;
  /** Loads the versions of a freshly opened project folder; Podgląd is shown. */
  load(dir: FileSystemDirectoryHandle): Promise<void>;
  /** "Nowa wersja": snapshot of `grid`, written to the folder, then opened. */
  create(grid: HeightGrid): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  /** Removes both files; Podgląd is shown if it was the active version. */
  remove(id: string): Promise<void>;
  setActive(active: Active): void;
  setTool(tool: Tool | undefined): void;
  setDraft(draft: Rect | undefined): void;
  /** Appends an edit to the active version (autosaved). */
  addEdit(edit: Edit): void;
  /** Sets an edit's z (Wyrównaj) or dz (Podnieś / Obniż) in the active version (autosaved); later edits replay over it. */
  setEditValue(id: string, value: number): void;
  deleteEdit(id: string): void;
  select(id: string | undefined): void;
  undo(): void;
  redo(): void;
  setShowDiff(show: boolean): void;
};

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Rewrites keep the file version the .bin was written with (the .bin is never rewritten). */
const toFile = (v: Version): VersionFile => ({
  version: v.fileVersion,
  id: v.id,
  name: v.name,
  created: v.created,
  grid: { cell: v.grid.cell, origin: v.grid.origin, cols: v.grid.cols, rows: v.grid.rows },
  edits: v.edits,
});

/** "Wersja n": one more than the highest n in use. */
function nextName(versions: Version[]): string {
  const n = versions.reduce((m, v) => Math.max(m, Number(/^Wersja (\d+)$/.exec(v.name)?.[1] ?? 0)), 0);
  return `Wersja ${n + 1}`;
}

async function readVersion(dir: FileSystemDirectoryHandle, file: string): Promise<Version> {
  const f = parseVersionFile(await (await readFile(dir, file)).text());
  if (`${f.id}.json` !== file) throw new Error(`id "${f.id}" doesn't match the filename`);
  const grid = unpackGrid(await (await readFile(dir, `${f.id}.bin`)).arrayBuffer(), f.grid, f.version);
  return { id: f.id, name: f.name, created: f.created, grid, edits: f.edits, fileVersion: f.version };
}

export const useVersions = create<VersionsState>()((set, get) => ({
  versions: [],
  broken: [],
  active: 'preview',
  unsaved: [],
  history: {},
  showDiff: false,

  async load(dir) {
    cancelSaves();
    set({ dir, versions: [], broken: [], active: 'preview', tool: undefined, selected: undefined, unsaved: [], history: {}, saveError: undefined });
    lastChange = undefined;
    const versions: Version[] = [];
    const broken: BrokenVersion[] = [];
    try {
      const vdir = await versionsDir(dir, false);
      for (const file of vdir ? await listFiles(vdir, '.json') : []) {
        try {
          versions.push(await readVersion(vdir!, file));
        } catch (err) {
          broken.push({ file, error: errText(err) });
        }
      }
    } catch (err) {
      broken.push({ file: '', error: errText(err) });
    }
    versions.sort((a, b) => a.created.localeCompare(b.created));
    if (get().dir === dir) set({ versions, broken });
  },

  async create(live) {
    const { dir, versions } = get();
    if (!dir) return;
    const created = new Date().toISOString();
    const id = `v${Date.now().toString(36)}`;
    const grid: HeightGrid = {
      ...live,
      origin: { ...live.origin },
      base: live.base.slice(),
      ...(live.outside && { outside: live.outside.slice() }),
    };
    const v: Version = { id, name: nextName(versions), created, grid, edits: [], fileVersion: 2 };
    try {
      const vdir = (await versionsDir(dir, true))!;
      // The .bin first: a version is listed by its JSON, so a failed export leaves no half version behind.
      await writeFile(vdir, `${id}.bin`, packGrid(grid));
      await writeFile(vdir, `${id}.json`, serializeVersionFile(toFile(v)));
    } catch (err) {
      return set({ saveError: errText(err) });
    }
    if (get().dir === dir) set((st) => ({ versions: [...st.versions, v], active: id, saveError: undefined }));
  },

  async rename(id, name) {
    const { dir, versions } = get();
    const v = versions.find((x) => x.id === id);
    if (!dir || !v || !name.trim()) return;
    const next = { ...v, name: name.trim() };
    set((st) => ({ versions: st.versions.map((x) => (x.id === id ? next : x)) }));
    await saveNow(id);
  },

  async remove(id) {
    const { dir } = get();
    if (!dir) return;
    cancelSave(id);
    await queues.get(id); // let a running write finish, so it can't recreate the JSON after the delete
    try {
      const vdir = await versionsDir(dir, false);
      if (vdir) {
        // JSON first, so a failure in between leaves an orphan .bin (ignored), not a version without its grid.
        await removeFile(vdir, `${id}.json`);
        await removeFile(vdir, `${id}.bin`);
      }
    } catch (err) {
      return set({ saveError: errText(err) });
    }
    set((st) => ({
      versions: st.versions.filter((x) => x.id !== id),
      active: st.active === id ? 'preview' : st.active,
      tool: st.active === id ? undefined : st.tool,
      selected: st.active === id ? undefined : st.selected,
      unsaved: st.unsaved.filter((x) => x !== id),
      saveError: undefined,
    }));
  },

  setActive(active) {
    set({ active, tool: undefined, draft: undefined, selected: undefined });
  },

  setTool(tool) {
    if (get().active !== 'preview') set({ tool, draft: undefined });
  },

  setDraft(draft) {
    set({ draft });
  },

  addEdit(edit) {
    command((edits) => [...edits, edit]);
  },

  setEditValue(id, value) {
    // Typing into the field changes the value per keystroke: one undo step per run of changes to the same edit.
    command((edits) => edits.map((e) => (e.id === id ? withValue(e, value) : e)), id);
  },

  deleteEdit(id) {
    command((edits) => edits.filter((e) => e.id !== id));
    if (get().selected === id) set({ selected: undefined });
  },

  undo() {
    step('undo', 'redo');
  },

  redo() {
    step('redo', 'undo');
  },

  setShowDiff(showDiff) {
    set({ showDiff });
  },

  select(selected) {
    set({ selected });
  },
}));

/** Sets the active version's edit list and schedules its autosave. */
function setEdits(edits: Edit[], history: { undo: Edit[][]; redo: Edit[][] }) {
  const { active } = useVersions.getState();
  useVersions.setState((st) => ({
    versions: st.versions.map((v) => (v.id === active ? { ...v, edits } : v)),
    history: { ...st.history, [active]: history },
    unsaved: st.unsaved.includes(active) ? st.unsaved : [...st.unsaved, active],
  }));
  scheduleSave(active);
}

/** The edit last changed by `setEditValue` (version + edit), so a run of changes to it merges into one undo step. */
let lastChange: string | undefined;

/** One undoable command on the active version: the list before it goes on the undo stack, redo is cleared. */
function command(f: (edits: Edit[]) => Edit[], merge?: string) {
  const { active, versions, history } = useVersions.getState();
  const v = versions.find((x) => x.id === active);
  if (!v) return;
  const h = history[active] ?? { undo: [], redo: [] };
  const key = merge && `${active}/${merge}`;
  const undo = key && key === lastChange ? h.undo : [...h.undo, v.edits];
  lastChange = key;
  setEdits(f(v.edits), { undo, redo: [] });
}

/** Undo or redo: moves the active version's list between the stacks. */
function step(from: 'undo' | 'redo', to: 'undo' | 'redo') {
  const { active, versions, history, selected } = useVersions.getState();
  const v = versions.find((x) => x.id === active);
  const h = history[active];
  const edits = h?.[from].at(-1);
  if (!v || !h || !edits) return;
  lastChange = undefined;
  setEdits(edits, { [from]: h[from].slice(0, -1), [to]: [...h[to], v.edits] } as { undo: Edit[][]; redo: Edit[][] });
  if (selected && !edits.some((e) => e.id === selected)) useVersions.setState({ selected: undefined });
}

// Autosave: one pending timer and one write chain per version, so writes of a version never overlap.
const timers = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

function scheduleSave(id: string) {
  window.clearTimeout(timers.get(id));
  timers.set(id, window.setTimeout(() => void saveNow(id), AUTOSAVE_MS));
}

function cancelSave(id: string) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
}

function cancelSaves() {
  for (const id of [...timers.keys()]) cancelSave(id);
}

/** Writes the version's JSON as it is when the write starts (after any write already running). */
function saveNow(id: string): Promise<void> {
  cancelSave(id);
  const run = (queues.get(id) ?? Promise.resolve()).then(async () => {
    const { dir, versions } = useVersions.getState();
    const v = versions.find((x) => x.id === id);
    if (!dir || !v) return;
    try {
      await writeFile((await versionsDir(dir, true))!, `${id}.json`, serializeVersionFile(toFile(v)));
      // Still the same content? Then it's saved; a change during the write keeps it unsaved (its timer is pending).
      useVersions.setState((st) =>
        st.dir === dir && st.versions.find((x) => x.id === id) === v
          ? { unsaved: st.unsaved.filter((x) => x !== id), saveError: undefined }
          : {},
      );
    } catch (err) {
      if (useVersions.getState().dir === dir) useVersions.setState({ saveError: errText(err) });
    }
  });
  queues.set(id, run);
  return run;
}

export const useActiveVersion = (): Version | undefined =>
  useVersions((s) => (s.active === 'preview' ? undefined : s.versions.find((v) => v.id === s.active)));

/**
 * The version's surface (edits replayed over its frozen base) as a grid, and each edit's cut / fill against the
 * surface before it. One replay per edit list, shared by all callers.
 */
export function versionSurface(v: Version): { grid: HeightGrid; volumes: EditVolume[] } {
  let s = surfaces.get(v.edits);
  if (!s || s.base !== v.grid) {
    const { h, volumes } = replay(v.grid, v.edits);
    s = { base: v.grid, grid: { ...v.grid, base: h }, volumes };
    surfaces.set(v.edits, s);
  }
  return s;
}
const surfaces = new WeakMap<Edit[], { base: HeightGrid; grid: HeightGrid; volumes: EditVolume[] }>();

/**
 * What Environment draws: the live generated terrain in Podgląd, or the active version's surface.
 * `live` = the generated terrain, for "Nowa wersja"; `plot` = the plot outline from the drawings.
 */
export function useEnvSurface(): { grid?: HeightGrid; live?: HeightGrid; plot?: Terrain['plot']; version?: Version } {
  const { grid: live, plot } = useTerrain();
  const version = useActiveVersion();
  return { grid: version ? versionSurface(version).grid : live, live, plot, version };
}
