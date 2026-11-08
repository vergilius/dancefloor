// Edit versions (PLAN.md §5 M4a, ADR 0003): frozen snapshots of the generated terrain, stored as
// `dancefloor-versions/<id>.json` + `<id>.bin` in the project folder. Environment shows either the live
// generated terrain ("Podgląd") or the active version.
import { create } from 'zustand';
import { listFiles, readFile, removeFile, versionsDir, writeFile } from '../project/folder';
import type { HeightGrid } from '../terrain/grid';
import { packGrid, parseVersionFile, serializeVersionFile, unpackGrid, type VersionFile } from '../versions/file';
import { useTerrain, type Terrain } from './terrain';

export type Version = { id: string; name: string; created: string; grid: HeightGrid; edits: never[] };
/** A version file that couldn't be read: listed with the reason, never deleted or overwritten. */
export type BrokenVersion = { file: string; error: string };
export type Active = 'preview' | string;

type VersionsState = {
  dir?: FileSystemDirectoryHandle;
  versions: Version[];
  broken: BrokenVersion[];
  active: Active;
  /** Last failed write (create / rename / delete). Cleared by the next successful one. */
  saveError?: string;
  /** Loads the versions of a freshly opened project folder; Podgląd is shown. */
  load(dir: FileSystemDirectoryHandle): Promise<void>;
  /** "Nowa wersja": snapshot of `grid`, written to the folder, then opened. */
  create(grid: HeightGrid): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  /** Removes both files; Podgląd is shown if it was the active version. */
  remove(id: string): Promise<void>;
  setActive(active: Active): void;
};

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const toFile = (v: Version): VersionFile => ({
  version: 1,
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
  const grid = unpackGrid(await (await readFile(dir, `${f.id}.bin`)).arrayBuffer(), f.grid);
  return { id: f.id, name: f.name, created: f.created, grid, edits: f.edits };
}

export const useVersions = create<VersionsState>()((set, get) => ({
  versions: [],
  broken: [],
  active: 'preview',

  async load(dir) {
    set({ dir, versions: [], broken: [], active: 'preview', saveError: undefined });
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
    const grid: HeightGrid = { ...live, origin: { ...live.origin }, base: live.base.slice(), uncertain: live.uncertain.slice() };
    const v: Version = { id, name: nextName(versions), created, grid, edits: [] };
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
    try {
      await writeFile((await versionsDir(dir, true))!, `${id}.json`, serializeVersionFile(toFile(next)));
      set({ saveError: undefined });
    } catch (err) {
      set({ saveError: errText(err) });
    }
  },

  async remove(id) {
    const { dir } = get();
    if (!dir) return;
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
      saveError: undefined,
    }));
  },

  setActive(active) {
    set({ active });
  },
}));

export const useActiveVersion = (): Version | undefined =>
  useVersions((s) => (s.active === 'preview' ? undefined : s.versions.find((v) => v.id === s.active)));

/**
 * What Environment draws: the live generated terrain in Podgląd, or the active version's surface (T1: its frozen
 * base). `live` = the generated terrain, for "Nowa wersja"; `plot` = the plot outline from the drawings.
 */
export function useEnvSurface(): { grid?: HeightGrid; live?: HeightGrid; plot?: Terrain['plot'] } {
  const { grid: live, plot } = useTerrain();
  const version = useActiveVersion();
  return { grid: version ? version.grid : live, live, plot };
}
