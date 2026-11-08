# M2 task list

Next: M2 done and merged 2026-11-08. Start M3 (terrain grid): sharpen PLAN.md §5 M3 with `spec-driven-development`,
then a new task list. Note (T6): `hitSheet` (`src/scene/snap.ts`) dispatches to `hitHorizontal` / `hitVertical`.
Note (T5): `MeasureTool` (`src/scene/MeasureTool.tsx`) listens on the canvas container (DOM events, not r3f), hits
sheet planes with `hitHorizontal` and snaps in screen px over all hit sheets + markers (`nearestOnScreen`,
`src/scene/snap.ts`). T6 adds a `hitVertical` next to it; `worldPoints` already handles vertical placements.
Esc ends the tool (store `measure` → undefined).
Note (T1): the worker returns both candidate points per label (`leader`, `byHeight`); `levelPoint(l, kind)` in
`src/dwg/labels.ts` picks by sheet kind on the main thread, so a kind change needs no re-parse.
Note (T2): reference = `useLevelReference()` / `useRefValue()` (`src/state/levels.ts`); every shown height goes
through `formatHeight(rel, ref)` (`src/project/levels.ts`).
Note (T4): `levelMarkers()` (`src/scene/markers.ts`) gives world points per resolved label; T5 snaps to them. Site
markers sit at value − reference, not at the sheet z.
Note (T3): viewport = layer: design 0 (default), environment `ENV_LAYER` 1, both via `inBothViewports` ref
(`src/scene/split.ts`). Lights must be on both layers to light env meshes. drei `Html` needs
`calculatePosition={designHtmlPosition}` (it assumes a full-width canvas). The camera frustum is forced to half
width every frame; CameraControls connect to the half div under the pointer.
M1c task notes are in git history (`tasks/todo.md` at 655ecaa).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Extract labels in the worker, counts in the sheet list
**Description:** Pure `src/dwg/labels.ts` on raw model-space entities: reference values (`0,00= +355.40 m npm`) and
absolute labels (kind `Tp` | `Ti` | `TpTi` | `bare`, value, point or none) with point association (site: ARC
leader; vertical: height-matched circle using the sheet's own reference). Called from the worker next to
`normalize`, returned in `ParseSummary`. The sheet list shows `Rzędne: n/m z punktem` per sheet.
**Acceptance criteria:**
- [x] Counts: PZT-01 7/7, PAB-07 2/2, PAB-08 7/8, PAB-09 7/7, PAB-10 7/7; other sheets show none
- [x] Decimal comma and dot both parse (PZT-01 `Tp= 355,08`)
**Verification:** `pnpm check`; user opens the folder and reads the counts.
**Dependencies:** none
**Files:** `src/dwg/labels.ts`, `src/dwg/types.ts`, `src/worker/protocol.ts`, `src/worker/dwg.worker.ts`, `src/ui/SheetList.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 2: Reference header and the height formatter
**Description:** Pure `src/project/levels.ts`: reference agreement across parsed sheets and `formatHeight(rel, ref)`.
Sheet list header shows `±0.00 = 355.40 m n.p.m. (4 arkusze)` or a flag (none / disagree); plan z in the list uses
the formatter.
**Acceptance criteria:**
- [x] Header shows 355.40 from 4 sheets
- [x] Plan z reads e.g. `+3.29 (358.69 m n.p.m.)`; with no reference (only plans opened) rel only and the flag
**Verification:** `pnpm check`; user reads the header and plan z values.
**Dependencies:** T1
**Files:** `src/project/levels.ts`, `src/ui/SheetList.tsx`, `src/ui/strings.ts`
**Scope:** S

### Checkpoint A (after T1–T2)
- [x] `pnpm check` green; reference and counts match the spec (user check)

### Task 3: Design and environment viewports (ADR 0001)
**Description:** Split the viewport into Design (left, everything that exists now, unchanged) and Environment (right)
with one camera and one set of controls. One `Canvas` rendered twice per frame with a scissor rectangle per half,
camera aspect / ortho frustum set per half, and objects assigned by three.js layer (design / environment / both).
Pointer events map to the half under the cursor. Environment shows the ground grid. A small "Projekt" / "Otoczenie"
caption in each half.
**Acceptance criteria:**
- [x] Orbit, pan, zoom, top/ortho views and "Dopasuj widok" in either half move both identically; resize keeps both undistorted
- [x] Design shows everything as before (sheets, PDF, layers); Environment shows only the grid
- [x] The align tool still picks correctly in Design; the saved view still restores
**Verification:** `pnpm check`; user checks both halves and runs the align tool once.
**Dependencies:** none (independent of T1–T2)
**Files:** `src/scene/Viewport.tsx`, `src/scene/split.ts` (render + event mapping), `src/scene/AlignTool.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 4: 3D level markers
**Description:** Resolved points → plan coords through the sheet's current placement (site transform, vertical
origin + x·dir, height y). Small dot + label `Tp 355.08 (−0.32)` per point. Drawn in both viewports. One toggle
"Rzędne" (store view setting, default on, not saved).
**Acceptance criteria:**
- [x] Elevation markers sit on their sheet circles (< 1 cm); PZT-01 `Tp= 355,08` marker at plan (16.05, −14.46)
- [x] Toggle hides/shows all markers; sheets without placement show none
**Verification:** `pnpm check`; user checks markers in 3D and top view.
**Dependencies:** T2, T3
**Files:** `src/scene/LevelMarkers.tsx`, `src/scene/Viewport.tsx`, `src/state/store.ts`, `src/ui/LayerPanel.tsx` (or toolbar), `src/ui/strings.ts`
**Scope:** M

### Task 5: Measure tool on horizontal sheets
**Description:** Tool "Pomiar" (Design viewport only) (store state `measure`, Esc clears). Click A, B: ray hit on visible horizontal sheet
planes, snap to visible segment endpoints and markers (screen-px radius). A–B line stays until Esc or the next
measurement. Readout overlay: 3D distance, horizontal distance, Δh (3 decimals), both heights rel + abs.
**Acceptance criteria:**
- [x] PZT-01 tank rectangle measures 3.00 × 2.40 m (± 1 cm); PAB-01 `A-WALL` x-extent 15.090 m (± 1 cm)
- [x] Esc clears; drags don't place picks
**Verification:** `pnpm check`; user measures the two values.
**Dependencies:** T4
**Files:** `src/scene/MeasureTool.tsx`, `src/scene/snap.ts`, `src/state/store.ts`, `src/scene/Viewport.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 6: Measure on vertical sheets
**Description:** Extend the hit test to vertical sheet planes (origin + x·dir, height y) and snapping to their
endpoints; nearest hit along the ray wins when sheets overlap.
**Acceptance criteria:**
- [x] PAB-08: Δh from ±0.00 to the ridge = 9.12 m (± 1 cm), heights shown rel + abs
- [x] Mixed A on a plan, B on an elevation works
**Verification:** `pnpm check`; user measures on PAB-08.
**Dependencies:** T5
**Files:** `src/scene/MeasureTool.tsx`, `src/scene/snap.ts`
**Scope:** S

### Checkpoint B (after T3–T6)
- [x] `pnpm check` green; all M2 ✅ in PLAN.md verified by the user; PLAN.md/CLAUDE.md status updated; merge
