# M1a task list

Next: T5 (INSERT expansion). Branch `feat/m1a`.
Note (T4): DWG closed LWPOLYLINE = `flag & 0x200`; ARC angles are radians; PAB-01 paper space isn't in `db.entities` (no `(paper space)` count).
Note: the WASM is loaded by the glue's own `new URL(…, import.meta.url)` (Vite bundles it); no copy script, no `public/wasm/`.

Commands: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`. No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

## Phase 1: Foundation

### Task 1: Scaffold the app
**Description:** Vite + React + TypeScript (strict), ESLint, using pnpm. Empty Polish shell page
("DanceFloor", a sidebar plus a canvas area with an r3f `<Canvas>` showing a grid). Add the scripts
`dev`, `build`, `lint`, `typecheck` and list them in CLAUDE.md. Replace the `npm init` fields in
`package.json`.
**Acceptance criteria:**
- [x] `pnpm dev` shows the shell with an orbitable 3D grid (user checked)
- [x] `pnpm build`, `pnpm lint`, `pnpm typecheck` all pass
- [x] Dependencies are limited to the planned stack (react, three, @react-three/fiber, @react-three/drei; zustand deferred to T7 when first used; dev: vite, typescript ~6.0, eslint + typescript-eslint, react-hooks plugin)
**Verification:** all four commands are green; user opens `pnpm dev` and sees the grid.
**Dependencies:** none
**Files:** `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `CLAUDE.md`
**Scope:** M

### Task 2: Open the project folder and remember it
**Description:** "Otwórz folder projektu" button → `showDirectoryPicker()`. List the `.dwg`/`.pdf` files.
Keep the handle in IndexedDB. On reload, show the remembered folder name and a "Przywróć dostęp" button
that re-requests permission.
**Acceptance criteria:**
- [x] Picking `dwg/` lists the 12 DWGs and 1 PDF
- [x] After a reload, one click restores the list without the picker
- [x] Extensions are matched case-insensitively (`.DWG` also listed)
**Verification:** user checks pick and reload in Chrome.
**Dependencies:** T1
**Files:** `src/project/folder.ts`, `src/ui/FolderPanel.tsx`
**Scope:** S

### Task 3: Parse a DWG in the worker (end-to-end spike)
**Description:** Copy `libredwg-web.wasm` to `public/wasm/` (via a script, so it stays in sync with the package
version). `src/worker/dwg.worker.ts` receives a file's bytes, parses and converts it, and returns
`{ entityCounts, layerNames, insunits, ms }`. Use a typed message protocol in `src/worker/protocol.ts`.
Clicking a file in the list shows its counts.
**Acceptance criteria:**
- [x] Clicking PAB-01 shows INSUNITS 4 and ~1898 entities, with no main-thread freeze
- [x] libredwg is imported only in `src/worker/` (lint rule `no-restricted-imports` elsewhere; probe import fails lint)
- [x] Parse errors come back as a message, not as an uncaught worker error (worker crash also rejects pending requests)
**Verification:** the lint rule fails on a deliberate import elsewhere (then revert it); user clicks through all 12 files and sees counts and parse time.
**Dependencies:** T2
**Files:** `src/worker/dwg.worker.ts`, `src/worker/parse.ts`, `src/worker/protocol.ts`, `scripts/copy-wasm.mjs`
**Scope:** M

### Checkpoint A (after T1–T3)
- [x] `CONSTRAINTS.md` written via `constraint-driven-development` (CLAUDE.md: once, after the scaffold)
- [x] All green; the riskiest integration (WASM in a worker) is proven
- [x] Review with the user before geometry work

---

## Phase 2: Geometry (pure functions, checked in the UI)

### Task 4: Normalize basic entities
**Description:** `normalize()` for LINE, ARC, CIRCLE, LWPOLYLINE (including bulge), SPLINE → segments in
metres (×0.001), grouped by layer. Unknown types are counted in `skipped`. Input types come from `src/dwg/types.ts`.
**Acceptance criteria:**
- [x] Coordinates in metres (PAB-01 sheet extents −7.56…22.26 × −19.47…6.56 m, user checked; `A-WALL` alone is 0.34…15.12 × −12.27…3.05 m, so the house is right and the grid lines/annotations extend past it); arcs/circles tessellated with ≤ 1 mm chord error; LWPOLYLINE bulges and closed flags handled
- [x] HATCH/DIMENSION and unknown types counted, not drawn
- [x] The worker returns a `NormalizedSheet` (transferable buffers)
**Verification:** user sees the extents and the skipped counts per file in the sheet panel.
**Dependencies:** T3
**Files:** `src/dwg/types.ts`, `src/dwg/normalize.ts`, `src/worker/parse.ts`
**Scope:** M

### Task 5: Expand INSERTs with transforms
**Description:** Recursively expand INSERT block references: base point, scale (including negative/mirrored),
rotation, nesting. Entities on layer `0` inside a block take the INSERT's layer.
**Acceptance criteria:**
- [ ] Translated, rotated, mirrored (sx = −1) and nested blocks land in the right place
- [ ] Layer-0 entities inside a block take the INSERT's layer
- [ ] Recursion is guarded (a cycle or a depth > 16 stops with a counted error)
**Verification:** checked in the browser once T8 draws sheets (doors, windows, grid bubbles in the right place on PAB-01).
**Dependencies:** T4
**Files:** `src/dwg/insert.ts`, `src/dwg/normalize.ts`
**Scope:** S

### Task 6: MTEXT stripping and text primitives
**Description:** `stripMtext()` removes `\f…;`, `\W…;`, `\H…;`, `\C…;`, `\Q…;`, `\T…;`, `\A…;`, `\L`/`\l`, `\O`/`\o`,
`{}` and `\P` → newline, and unescapes `\\`. MTEXT/TEXT become text primitives (m, rotation, height).
**Acceptance criteria:**
- [ ] `\fArial|b0|i0|c238|p34|;\W.8;1` → `1`; `0,00= +355.40 m npm` survives intact; Polish diacritics preserved; leftover `\` codes logged as dev warnings
- [ ] Texts carry their insertion point in metres, plus height and rotation
**Verification:** checked in the browser once T8 draws texts (grid labels, level labels readable).
**Dependencies:** T4
**Files:** `src/dwg/mtext.ts`, `src/dwg/normalize.ts`
**Scope:** S

### Checkpoint B (after T4–T6)
- [ ] Typecheck, lint and build green; the sheet panel shows normalized extents and counts for all 12 files

---

## Phase 3: Product

### Task 7: Sheet list with suggested kind/z, saved to the project JSON
**Description:** `suggest(filename)` → `{ kind, z? }` (rules in PLAN.md M1a). A sheet list with a kind
dropdown and a z input. "Zapisz" writes `dancefloor.json` to the folder; it loads on open.
**Acceptance criteria:**
- [ ] All 13 real filenames get the expected kind/z suggestion
- [ ] Saved JSON has `version: 1` and reloads to the same state
- [ ] After a reload, the confirmed kinds/z are restored from the file
**Verification:** user checks the suggestions, edits a z, saves, reloads.
**Dependencies:** T2 (T3 for parsing on open)
**Files:** `src/project/suggest.ts`, `src/project/projectFile.ts`, `src/state/store.ts`, `src/ui/SheetList.tsx`
**Scope:** M

### Task 8: Draw plan sheets in 3D
**Description:** For every `plan` sheet: one `LineSegments` per layer at its `placement.z`, using
`src/scene/coords.ts` (x, y, z) → (x, z, −y). drei `CameraControls`, with the camera framed on the
loaded sheets. Texts via drei `<Text>`.
**Acceptance criteria:**
- [ ] Axes are right: north/east match the plan view (not mirrored), heights go up
- [ ] PAB-01/02/03 appear stacked at 0 / 3.29 / 9.12 m
- [ ] Orbiting stays smooth with all three plans loaded (user's judgement; measured in M3)
**Verification:** user checks the stacked view.
**Dependencies:** T6, T7
**Files:** `src/scene/coords.ts`, `src/scene/SheetObject.tsx`, `src/scene/Viewport.tsx`
**Scope:** M

### Task 9: Layer panel with noise layers hidden by default
**Description:** Per sheet, a layer list with visibility toggles and entity counts. Default-hidden patterns
from PLAN.md §1 (`G-ANNO-*` except `G-ANNO-DIMS*`, `PZT_WYMIARY-1`, `I-FURN*`, `P-SANR-FIXT`, `*-PATT*`).
Visibility is saved in the project JSON.
**Acceptance criteria:**
- [ ] On PAB-01 the noise layers start hidden and walls, grid and levels start visible
- [ ] Toggling a layer hides it immediately in 3D; the state survives save and reload
- [ ] The skipped entity counts from T4 are shown per sheet
**Verification:** user toggles `A-WALL` and reloads.
**Dependencies:** T8
**Files:** `src/project/layerDefaults.ts`, `src/ui/LayerPanel.tsx`, `src/state/store.ts`
**Scope:** S

### Task 10: M1a acceptance on the real files
**Description:** Final check on the real files: all 12 DWGs parse and normalize in < 2 s each (parse time shown
in the sheet panel), and the `S-GRID-1` lines of PAB-01/02/03 coincide when viewed from above. Mark M1a done in
PLAN.md and CLAUDE.md.
**Acceptance criteria:**
- [ ] Parse times < 2 s and grid lines coincide (user check)
- [ ] Every M1a ✅ criterion in PLAN.md is checked off, including the user's browser check
**Verification:** user runs the final browser checklist.
**Dependencies:** T9
**Files:** `PLAN.md`, `CLAUDE.md`
**Scope:** S

### Checkpoint C (M1a complete)
- [ ] Build, lint and typecheck green
- [ ] User browser check passed
