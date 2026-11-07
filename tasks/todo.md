# M1a task list

Commands (once T1 is done): `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm dev`.
Every task: tests pass, build is clean, and a "verify in browser" checklist goes to the user (CLAUDE.md).

---

## Phase 1: Foundation

### Task 1: Scaffold the app
**Description:** Vite + React + TypeScript (strict), Vitest, ESLint, using pnpm. Empty Polish shell page
("Garden Levels", a sidebar plus a canvas area with an r3f `<Canvas>` showing a grid). Add the scripts
`dev`, `build`, `test`, `lint`, `typecheck` and list them in CLAUDE.md. Replace the `npm init` fields in
`package.json`.
**Acceptance criteria:**
- [ ] `pnpm dev` shows the shell with an orbitable 3D grid
- [ ] `pnpm build`, `pnpm test` (1 smoke test), `pnpm lint`, `pnpm typecheck` all pass
- [ ] Dependencies are limited to the planned stack (react, three, @react-three/fiber, @react-three/drei, zustand; dev: vite, vitest, typescript, eslint)
**Verification:** all four commands are green; user opens `pnpm dev` and sees the grid.
**Dependencies:** none
**Files:** `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `CLAUDE.md`
**Scope:** M

### Task 2: Open the project folder and remember it
**Description:** "Otwórz folder projektu" button → `showDirectoryPicker()`. List the `.dwg`/`.pdf` files.
Keep the handle in IndexedDB. On reload, show the remembered folder name and a "Przywróć dostęp" button
that re-requests permission.
**Acceptance criteria:**
- [ ] Picking `dwg/` lists the 12 DWGs and 1 PDF
- [ ] After a reload, one click restores the list without the picker
- [ ] File filtering (extension, case-insensitive) is unit-tested
**Verification:** unit test for the filter; user checks pick and reload in Chrome.
**Dependencies:** T1
**Files:** `src/project/folder.ts`, `src/project/folder.test.ts`, `src/ui/FolderPanel.tsx`
**Scope:** S

### Task 3: Parse a DWG in the worker (end-to-end spike)
**Description:** Copy `libredwg-web.wasm` to `public/wasm/` (via a script, so it stays in sync with the package
version). `src/worker/dwg.worker.ts` receives a file's bytes, parses and converts it, and returns
`{ entityCounts, layerNames, insunits, ms }`. Use a typed message protocol in `src/worker/protocol.ts`.
Clicking a file in the list shows its counts.
**Acceptance criteria:**
- [ ] Clicking PAB-01 shows INSUNITS 4 and ~1898 entities, with no main-thread freeze
- [ ] libredwg is imported only in `src/worker/` (lint rule `no-restricted-imports` elsewhere)
- [ ] Parse errors come back as a message, not as an uncaught worker error
**Verification:** a Node test running the parse core on `dwg/PAB-01*.dwg` (skipped when absent); the lint rule fails on a deliberate import elsewhere; user clicks through all 12 files.
**Dependencies:** T2
**Files:** `src/worker/dwg.worker.ts`, `src/worker/parse.ts`, `src/worker/protocol.ts`, `src/worker/parse.realfiles.test.ts`, `scripts/copy-wasm.mjs`
**Scope:** M

### Checkpoint A (after T1–T3)
- [ ] `CONSTRAINTS.md` written via `constraint-driven-development` (CLAUDE.md: once, after the scaffold)
- [ ] All green; the riskiest integration (WASM in a worker) is proven
- [ ] Review with the user before geometry work

---

## Phase 2: Geometry (pure, test-first)

### Task 4: Normalize basic entities
**Description:** `normalize()` for LINE, ARC, CIRCLE, LWPOLYLINE (including bulge), SPLINE → segments in
metres (×0.001), grouped by layer. Unknown types are counted in `skipped`. Input types come from `src/dwg/types.ts`.
**Acceptance criteria:**
- [ ] Synthetic fixtures: a line in mm comes out in m; arc/circle tessellation error ≤ 1 mm; a bulge of 1 gives a semicircle; a closed polyline closes
- [ ] HATCH/DIMENSION and unknown types counted, not drawn
- [ ] The worker returns a `NormalizedSheet` (transferable buffers)
**Verification:** `pnpm test src/dwg`.
**Dependencies:** T3
**Files:** `src/dwg/types.ts`, `src/dwg/normalize.ts`, `src/dwg/normalize.test.ts`, `src/worker/parse.ts`
**Scope:** M

### Task 5: Expand INSERTs with transforms
**Description:** Recursively expand INSERT block references: base point, scale (including negative/mirrored),
rotation, nesting. Entities on layer `0` inside a block take the INSERT's layer.
**Acceptance criteria:**
- [ ] Fixtures: translated, rotated 90°, mirrored (sx = −1) and 2-level nested blocks land at the expected coordinates
- [ ] Layer-0 inheritance tested
- [ ] Recursion is guarded (a cycle or a depth > 16 stops with a counted error)
**Verification:** `pnpm test src/dwg`.
**Dependencies:** T4
**Files:** `src/dwg/insert.ts`, `src/dwg/insert.test.ts`, `src/dwg/normalize.ts`
**Scope:** S

### Task 6: MTEXT stripping and text primitives
**Description:** `stripMtext()` removes `\f…;`, `\W…;`, `\H…;`, `\C…;`, `\Q…;`, `\T…;`, `\A…;`, `\L`/`\l`, `\O`/`\o`,
`{}` and `\P` → newline, and unescapes `\\`. MTEXT/TEXT become text primitives (m, rotation, height).
**Acceptance criteria:**
- [ ] Real samples pass: `\fArial|b0|i0|c238|p34|;\W.8;1` → `1`; `0,00= +355.40 m npm` survives intact; Polish diacritics preserved
- [ ] Texts carry their insertion point in metres, plus height and rotation
**Verification:** `pnpm test src/dwg`.
**Dependencies:** T4
**Files:** `src/dwg/mtext.ts`, `src/dwg/mtext.test.ts`, `src/dwg/normalize.ts`
**Scope:** S

### Checkpoint B (after T4–T6)
- [ ] All green; the worker returns normalized sheets for all 12 files (Node real-file test, skipped when absent)

---

## Phase 3: Product

### Task 7: Sheet list with suggested kind/z, saved to the project JSON
**Description:** `suggest(filename)` → `{ kind, z? }` (rules in PLAN.md M1a). A sheet list with a kind
dropdown and a z input. "Zapisz" writes `garden-levels.json` to the folder; it loads on open.
**Acceptance criteria:**
- [ ] `suggest` unit-tested against all 13 real filenames (as strings; no file access needed)
- [ ] The JSON round-trips (load(save(p)) deep-equals p) and has `version: 1`
- [ ] After a reload, the confirmed kinds/z are restored from the file
**Verification:** unit tests; user edits a z, saves, reloads.
**Dependencies:** T2 (T3 for parsing on open)
**Files:** `src/project/suggest.ts`, `src/project/suggest.test.ts`, `src/project/projectFile.ts`, `src/project/projectFile.test.ts`, `src/state/store.ts`, `src/ui/SheetList.tsx`
**Scope:** M

### Task 8: Draw plan sheets in 3D
**Description:** For every `plan` sheet: one `LineSegments` per layer at its `placement.z`, using
`src/scene/coords.ts` (x, y, z) → (x, z, −y). drei `CameraControls`, with the camera framed on the
loaded sheets. Texts via drei `<Text>`.
**Acceptance criteria:**
- [ ] The coords helper is unit-tested (axis mapping, height)
- [ ] PAB-01/02/03 appear stacked at 0 / 3.29 / 9.12 m
- [ ] Orbiting stays smooth with all three plans loaded (user's judgement; measured in M3)
**Verification:** unit test; user checks the stacked view.
**Dependencies:** T6, T7
**Files:** `src/scene/coords.ts`, `src/scene/coords.test.ts`, `src/scene/SheetObject.tsx`, `src/scene/Viewport.tsx`
**Scope:** M

### Task 9: Layer panel with noise layers hidden by default
**Description:** Per sheet, a layer list with visibility toggles and entity counts. Default-hidden patterns
from PLAN.md §1 (`G-ANNO-*` except `G-ANNO-DIMS*`, `PZT_WYMIARY-1`, `I-FURN*`, `P-SANR-FIXT`, `*-PATT*`).
Visibility is saved in the project JSON.
**Acceptance criteria:**
- [ ] The default-hidden matcher is unit-tested against PAB-01's real layer names (listed as strings)
- [ ] Toggling a layer hides it immediately in 3D; the state survives save and reload
- [ ] The skipped entity counts from T4 are shown per sheet
**Verification:** unit test; user toggles `A-WALL` and reloads.
**Dependencies:** T8
**Files:** `src/project/layerDefaults.ts`, `src/project/layerDefaults.test.ts`, `src/ui/LayerPanel.tsx`, `src/state/store.ts`
**Scope:** S

### Task 10: M1a acceptance on the real files
**Description:** A real-file test suite (skipped when `dwg/` is absent): all 12 DWGs parse and normalize in
< 2 s each, and the `S-GRID-1` segments of PAB-01/02/03 coincide within 1 mm. Mark M1a done in PLAN.md
and CLAUDE.md.
**Acceptance criteria:**
- [ ] Timing and grid-coincidence tests pass locally
- [ ] Every M1a ✅ criterion in PLAN.md is checked off, including the user's browser check
**Verification:** `pnpm test`; user runs the final browser checklist.
**Dependencies:** T9
**Files:** `src/dwg/m1a.realfiles.test.ts`, `PLAN.md`, `CLAUDE.md`
**Scope:** S

### Checkpoint C (M1a complete)
- [ ] All tests, build, lint and typecheck green
- [ ] User browser check passed
