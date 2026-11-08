// App state: the open project folder, its sheets (saved or suggested) and per-file parse results.
import { create } from 'zustand';
import { DEFAULT_BOTTOM, DEFAULT_TOP, EMPTY_HOUSE, type Block, type House } from '../house/blocks';
import { listSourceFiles, type SourceFile } from '../project/folder';
import { apply, fromTwoPairs, type Similarity2D, type Vec2 } from '../project/align';
import { DEFAULT_GROUPS, type GroupId, type Groups } from '../project/layerGroups';
import { readProjectFile, writeProjectFile, type Sheet, type SheetKind } from '../project/projectFile';
import { suggest } from '../project/suggest';
import type { VerticalPlacement } from '../project/vertical';
import { renderPdf as renderPdfPage, type PdfRender } from '../pdf/render';
import { parseDwg } from '../worker/client';
import type { ParseSummary } from '../worker/protocol';

/** `saved` = confirmed in dancefloor.json; `suggested` = from the filename, not saved yet. */
export type SheetRow = Sheet & { type?: SourceFile['type']; source: 'saved' | 'suggested'; missing: boolean };

export type ParseState =
  | { status: 'parsing' }
  | { status: 'done'; summary: ParseSummary }
  | { status: 'error'; message: string };

export type PdfState = { status: 'rendering' } | { status: 'done'; render: PdfRender } | { status: 'error'; message: string };

/**
 * 2-point tool (M1c T6): picks alternate A (plan coords), A′ (the aligned sheet's own coords), B (plan), B′ (sheet).
 * `before` = the row's transform and dirty flag at start, restored on cancel.
 */
export type AlignTool = { file: string; picks: Vec2[]; before: { transform?: Similarity2D; dirty: boolean } };

export type ProjectState = {
  dir?: FileSystemDirectoryHandle;
  sheets: SheetRow[];
  dirty: boolean;
  /** dancefloor.json exists but couldn't be read. Saving is blocked so we don't overwrite it. */
  loadError?: string;
  saveError?: string;
  parsed: Record<string, ParseState>;
  /** PDF sheets rendered to a canvas (M1c underlay). */
  pdfs: Record<string, PdfState>;
  /** PDF underlay opacity per file (0–1, default 1). View setting: not saved, doesn't mark the project dirty. */
  pdfOpacity: Record<string, number>;
  /** 3D level markers on/off (M2). View setting: not saved, doesn't mark the project dirty. */
  showLevels: boolean;
  /** Level markers also in the Environment viewport (off by default). View setting: not saved. */
  showLevelsEnv: boolean;
  /** Terrain mesh + plot outline in the Environment viewport (M3). View setting: not saved. */
  showTerrain: boolean;
  align?: AlignTool;
  /** Measure tool (M2): on while set; 0–2 picked world points (x, y, z). View state: not saved. */
  measure?: { picks: [number, number, number][] };
  /** Layer groups, project-wide (T9). */
  groups: Groups;
  /** House massing (M5), saved in dancefloor.json. */
  house: House;
  /** House solids in the Environment viewport (M5). View setting: not saved. */
  showHouse: boolean;
  /** Window and door openings cut into the house (M5b). View setting: not saved. */
  showOpenings: boolean;
  /** House draw tool (M5): plan corners picked so far; `redraw` = index of the flat block whose outline is replaced. */
  houseDraw?: { picks: Vec2[]; redraw?: number };
  open(dir: FileSystemDirectoryHandle): Promise<void>;
  setKind(file: string, kind: SheetKind): void;
  setZ(file: string, z: number): void;
  /** Elevations/sections: sets the (edited) placement, which then wins over the derived one. */
  setVertical(file: string, placement: VerticalPlacement): void;
  /** Elevations/sections: drops the saved placement, so it is derived again. */
  resetVertical(file: string): void;
  /** Site/PDF sheets: drops the saved transform (site: back to the automatic one, PDF: identity). */
  resetTransform(file: string): void;
  /** Site/PDF sheets: sets the transform (2-point tool); it then wins like a saved one. */
  setTransform(file: string, transform: Similarity2D): void;
  startAlign(file: string): void;
  /**
   * Adds the next pick. A′ shifts the sheet (keeping `current`'s rotation and scale) so A′ lands on A; B′ computes
   * the full transform from both pairs, applies it and ends the tool.
   */
  pickAlign(p: Vec2, current: Similarity2D): void;
  cancelAlign(): void;
  startMeasure(): void;
  /** Adds A or B; after a full measurement the next pick starts a new one. */
  pickMeasure(p: [number, number, number]): void;
  stopMeasure(): void;
  setGroup(group: GroupId, visible: boolean): void;
  setLayer(file: string, layer: string, visible: boolean): void;
  /** `derived`: placements of vertical sheets and transforms of site sheets with none saved yet, written with them. */
  save(derived?: Derived): Promise<void>;
  parse(file: string): Promise<void>;
  renderPdf(file: string): Promise<void>;
  setPdfOpacity(file: string, opacity: number): void;
  setShowLevels(show: boolean): void;
  setShowLevelsEnv(show: boolean): void;
  setShowTerrain(show: boolean): void;
  setShowHouse(show: boolean): void;
  setShowOpenings(show: boolean): void;
  /** Hide or show one façade opening (saved in `house.hiddenOpenings`). */
  toggleOpening(key: string): void;
  /** Replaces the block with the same name, or appends it. */
  putBlock(block: Block): void;
  /** As-built house lift (m, ADR 0007); the loaded versions are rebased to it (absolute heights kept). */
  setHouseLift(lift: number): void;
  /** Replaces block `index`; refused (false) if the new name is taken by another block. */
  updateBlock(index: number, block: Block): boolean;
  removeBlock(index: number): void;
  /** Starts drawing a new flat block, or re-drawing block `redraw` (keeps its name and heights). */
  startHouseDraw(redraw?: number): void;
  addHouseCorner(p: Vec2): void;
  /** Backspace: drops the last corner. */
  dropHouseCorner(): void;
  /** Closes the outline (≥ 3 corners) into the block. */
  finishHouseDraw(): void;
  cancelHouseDraw(): void;
};

function nextBlockName(blocks: Block[]): string {
  let n = 1;
  while (blocks.some((b) => b.name === `Blok ${n}`)) n++;
  return `Blok ${n}`;
}

export type Derived = { placements?: Record<string, VerticalPlacement>; transforms?: Record<string, Similarity2D> };

/** Kinds parsed as soon as the folder opens (or the kind is chosen): they are placed in 3D. */
const AUTO_PARSE = new Set<SheetKind>(['plan', 'elevation', 'section', 'site']);

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
  pdfs: {},
  pdfOpacity: {},
  showLevels: true,
  showLevelsEnv: false,
  showTerrain: true,
  showHouse: true,
  showOpenings: false,
  groups: DEFAULT_GROUPS,
  house: EMPTY_HOUSE,

  async open(dir) {
    const files = await listSourceFiles(dir);
    let saved: Sheet[] = [];
    let groups = DEFAULT_GROUPS;
    let house = EMPTY_HOUSE;
    let loadError: string | undefined;
    try {
      const project = await readProjectFile(dir);
      saved = project?.sheets ?? [];
      groups = { ...DEFAULT_GROUPS, ...project?.groups };
      house = project?.house ?? EMPTY_HOUSE;
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
    set({ dir, sheets, groups, house, dirty: false, loadError, saveError: undefined, parsed: {}, pdfs: {}, align: undefined, measure: undefined, houseDraw: undefined });
    // Plans and vertical sheets are placed in 3D, so parse them right away. The worker handles one file at a time.
    for (const s of sheets) if (AUTO_PARSE.has(s.kind) && s.type === 'dwg' && !s.missing) void get().parse(s.file);
    for (const s of sheets) if (s.kind === 'pdf' && s.type === 'pdf' && !s.missing) void get().renderPdf(s.file);
  },

  setKind(file, kind) {
    set((st) => ({
      dirty: true,
      align: st.align?.file === file ? undefined : st.align,
      // A transform belongs to the sheet as aligned under its old kind, so a kind change drops it.
      sheets: edit(st.sheets, file, ({ placement, ...r }) => {
        if (kind !== 'plan') return { ...r, kind, transform: undefined };
        const z = (placement?.type === 'horizontal' ? placement.z : undefined) ?? (r.type ? suggest({ name: file, type: r.type }).z : undefined) ?? 0;
        return { ...r, kind, transform: undefined, placement: { type: 'horizontal', z } };
      }),
    }));
    const row = get().sheets.find((r) => r.file === file);
    if (AUTO_PARSE.has(kind) && row?.type === 'dwg' && !row.missing && !get().parsed[file]) void get().parse(file);
    if (kind === 'pdf' && row?.type === 'pdf' && !row.missing && !get().pdfs[file]) void get().renderPdf(file);
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

  resetTransform(file) {
    set((st) => ({ dirty: true, sheets: edit(st.sheets, file, (r) => ({ ...r, transform: undefined })) }));
  },

  setTransform(file, transform) {
    set((st) => ({ dirty: true, sheets: edit(st.sheets, file, (r) => ({ ...r, transform })) }));
  },

  startAlign(file) {
    get().cancelAlign();
    get().cancelHouseDraw();
    const { sheets, dirty } = get();
    const transform = sheets.find((r) => r.file === file)?.transform;
    set({ measure: undefined, align: { file, picks: [], before: { transform, dirty } } });
  },

  pickAlign(p, current) {
    const { align } = get();
    if (!align) return;
    const picks = [...align.picks, p];
    if (picks.length === 2) {
      // One pair fixes only the shift: move the sheet so A′ lies on A, then B′ is picked near B.
      const [a, a2] = picks as [Vec2, Vec2];
      const q = apply(current, a2);
      get().setTransform(align.file, { ...current, translate: { x: current.translate.x + a.x - q.x, y: current.translate.y + a.y - q.y } });
    }
    if (picks.length < 4) return set({ align: { ...align, picks } });
    const [a, a2, b, b2] = picks as [Vec2, Vec2, Vec2, Vec2];
    const t = fromTwoPairs(a2, a, b2, b);
    // B′ on top of A′ gives no transform: pick B and B′ again.
    if (!t) return set({ align: { ...align, picks: picks.slice(0, 2) } });
    get().setTransform(align.file, t);
    set({ align: undefined });
  },

  cancelAlign() {
    const { align } = get();
    if (!align) return;
    const { transform, dirty } = align.before;
    set((st) => ({ align: undefined, dirty, sheets: edit(st.sheets, align.file, (r) => ({ ...r, transform })) }));
  },

  startMeasure() {
    get().cancelAlign();
    get().cancelHouseDraw();
    set({ measure: { picks: [] } });
  },

  pickMeasure(p) {
    const { measure } = get();
    if (!measure) return;
    set({ measure: { picks: measure.picks.length >= 2 ? [p] : [...measure.picks, p] } });
  },

  stopMeasure() {
    set({ measure: undefined });
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

  async save({ placements = {}, transforms = {} } = {}) {
    const { dir, groups, house, loadError } = get();
    if (!dir || loadError) return;
    const sheets = get().sheets.map((r) => ({
      ...r,
      placement: r.placement ?? placements[r.file],
      transform: r.transform ?? transforms[r.file],
    }));
    const out: Sheet[] = sheets.map(({ file, kind, placement, transform, layers }) => ({
      file,
      kind,
      ...(placement && { placement }),
      ...(transform && { transform }),
      ...(layers && Object.keys(layers).length > 0 && { layers }),
    }));
    try {
      const withHouse = house.blocks.length > 0 || house.hiddenOpenings.length > 0 || !!house.lift;
      await writeProjectFile(dir, { version: 1, sheets: out, groups, ...(withHouse && { house }) });
      // Keep the written placements/transforms on the rows, so they are used (not re-derived) from now on.
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

  async renderPdf(file) {
    const { dir } = get();
    if (!dir) return;
    const setP = (p: PdfState) => {
      if (get().dir === dir) set((st) => ({ pdfs: { ...st.pdfs, [file]: p } }));
    };
    setP({ status: 'rendering' });
    try {
      const bytes = await (await (await dir.getFileHandle(file)).getFile()).arrayBuffer();
      setP({ status: 'done', render: await renderPdfPage(bytes) });
    } catch (err) {
      setP({ status: 'error', message: errText(err) });
    }
  },

  setPdfOpacity(file, opacity) {
    set((st) => ({ pdfOpacity: { ...st.pdfOpacity, [file]: opacity } }));
  },

  setShowLevels(showLevels) {
    set({ showLevels });
  },

  setShowLevelsEnv(showLevelsEnv) {
    set({ showLevelsEnv });
  },

  setShowTerrain(showTerrain) {
    set({ showTerrain });
  },

  setShowHouse(showHouse) {
    set({ showHouse });
  },

  setShowOpenings(showOpenings) {
    set({ showOpenings });
  },

  toggleOpening(key) {
    set((st) => {
      const h = st.house.hiddenOpenings;
      const hiddenOpenings = h.includes(key) ? h.filter((k) => k !== key) : [...h, key];
      return { dirty: true, house: { ...st.house, hiddenOpenings } };
    });
  },

  putBlock(block) {
    set((st) => {
      const i = st.house.blocks.findIndex((b) => b.name === block.name);
      const blocks = i < 0 ? [...st.house.blocks, block] : st.house.blocks.map((b, k) => (k === i ? block : b));
      return { dirty: true, house: { ...st.house, blocks } };
    });
  },

  setHouseLift(lift) {
    if (lift === (get().house.lift ?? 0)) return;
    set((st) => ({ dirty: true, house: { ...st.house, lift } }));
  },

  updateBlock(index, block) {
    const { blocks } = get().house;
    if (blocks.some((b, k) => k !== index && b.name === block.name)) return false;
    set((st) => ({ dirty: true, house: { ...st.house, blocks: st.house.blocks.map((b, k) => (k === index ? block : b)) } }));
    return true;
  },

  removeBlock(index) {
    set((st) => ({ dirty: true, houseDraw: undefined, house: { ...st.house, blocks: st.house.blocks.filter((_, k) => k !== index) } }));
  },

  startHouseDraw(redraw) {
    get().cancelAlign();
    set({ measure: undefined, houseDraw: { picks: [], redraw } });
  },

  addHouseCorner(p) {
    const { houseDraw } = get();
    if (!houseDraw) return;
    const last = houseDraw.picks.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-4) return; // double click on the same corner
    set({ houseDraw: { ...houseDraw, picks: [...houseDraw.picks, p] } });
  },

  dropHouseCorner() {
    const { houseDraw } = get();
    if (houseDraw) set({ houseDraw: { ...houseDraw, picks: houseDraw.picks.slice(0, -1) } });
  },

  finishHouseDraw() {
    const { houseDraw, house } = get();
    if (!houseDraw || houseDraw.picks.length < 3) return;
    const polygon = houseDraw.picks;
    const old = houseDraw.redraw === undefined ? undefined : house.blocks[houseDraw.redraw];
    const block: Block =
      old?.kind === 'flat'
        ? { ...old, polygon }
        : { kind: 'flat', name: nextBlockName(house.blocks), polygon, bottom: DEFAULT_BOTTOM, top: DEFAULT_TOP };
    const blocks = old ? house.blocks.map((b, k) => (k === houseDraw.redraw ? block : b)) : [...house.blocks, block];
    set({ dirty: true, houseDraw: undefined, house: { ...house, blocks } });
  },

  cancelHouseDraw() {
    set({ houseDraw: undefined });
  },
}));
