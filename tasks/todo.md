# M1b task list

Next: M1b merged to main (733cc6f). M1c spec drafted in PLAN.md §5 M1c on branch `feat/m1c`; waiting for user approval, then planning-and-task-breakdown → new tasks/plan.md + tasks/todo.md.
Known issue (camera, deferred by the user as minor): switching "Widok z góry" ↔ "Widok 3D" resets both cameras' position.
Note (spec): data facts and the expected result per sheet are in PLAN.md §5 M1b. Sheet y = height rel. ±0.00, no scale.
M1a task notes are in git history (`tasks/todo.md` at 032c110).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Axis mapping from grid labels
**Description:** Pure `src/project/vertical.ts`: collect `S-GRID-1` grid lines and their `S-GRID-IDEN` labels on a
sheet; match a vertical sheet's labels to the reference plan's (plan with z = 0); fit sheet x = s·p + t (s = ±1).
Vertical sheets (elevation/section) auto-parse on open. The sheet list shows, per vertical sheet, matched labels,
max residual (mm) and look direction (N/E/S/W), or the reason it failed.
**Acceptance criteria:**
- [x] PAB-04..10 each show `7/7` and a residual < 1 mm
- [x] Look directions match the PLAN.md M1b table (A-A east, B-B north, C-C south, N south, E west, W east, S north)
- [x] A sheet with < 2 matches or residual > 5 mm shows a reason (e.g. kind set to elevation on a detail sheet)
**Verification:** `pnpm check`; user opens the folder and reads the values in the sheet list.
**Dependencies:** none
**Files:** `src/project/vertical.ts`, `src/state/store.ts`, `src/ui/SheetList.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 2: Plane position (cut lines, wall extent)
**Description:** Sections: cut segment(s) on the plan's `G-ANNO-SYMB-2` nearest the `G-ANNO-SYMB` letter from the
filename (`PRZEKRÓJ X-X`); for a jog, the longest segment parallel to `dir`. Elevations: outermost `A-WALL` extent
on the viewer side. Combine with T1 into `placement: { type: 'vertical', origin, dir }`; show the plane position.
**Acceptance criteria:**
- [x] Plane positions match the PLAN.md table (A-A x 6.712, B-B y −6.363, C-C y −0.063, N y 3.051, E x 15.124, W x 0.034, S y −14.966)
- [x] A section with no letter/cut line found shows a reason
**Verification:** `pnpm check`; user reads the plane positions in the sheet list.
**Dependencies:** T1
**Files:** `src/project/vertical.ts`, `src/ui/SheetList.tsx`, `src/ui/strings.ts`
**Scope:** S

### Task 3: Draw vertical sheets in 3D
**Description:** Draw placed vertical sheets like plans (per-layer `LineSegments`, layer panel and groups apply),
standing on their plane: sheet (x, y) → origin + x·dir at height y. Texts lie in the plane, readable from the
viewer side. Fit-view framing includes them.
**Acceptance criteria:**
- [x] Top view: each vertical sheet's grid stubs stand on the plan's grid lines (< 1 cm)
- [x] Each elevation's ±0.00 line lies at z = 0 (on PAB-01's floor); texts readable from outside, not mirrored
- [x] Layer/group toggles work on vertical sheets
**Verification:** `pnpm check`; user checks top view and 3D view.
**Dependencies:** T2
**Files:** `src/scene/coords.ts`, `src/scene/SheetObject.tsx`, `src/scene/SheetTexts.tsx`, `src/scene/Viewport.tsx`
**Scope:** M

### Checkpoint A (after T1–T3)
- [x] `pnpm check` green; all 7 vertical sheets placed and drawn correctly (user check)

### Task 4: Save placement and edit the plane position
**Description:** `projectFile.ts` accepts and validates the vertical placement. Derive only when the sheet has no
saved placement. The sheet list has a number input for the plane position (m); changing it moves the sheet.
**Acceptance criteria:**
- [x] "Zapisz" writes `{ type: "vertical", origin, dir }`; after reload the same placement is used (not re-derived)
- [x] Editing the plane position moves the sheet live and marks the project dirty
**Verification:** `pnpm check`; user edits S's plane, saves, reloads.
**Dependencies:** T3
**Files:** `src/project/projectFile.ts`, `src/state/store.ts`, `src/ui/SheetList.tsx`
**Scope:** S

### Task 5: M1b acceptance
**Description:** Final browser check against the M1b ✅ in PLAN.md; mark M1b done in PLAN.md and CLAUDE.md.
**Acceptance criteria:**
- [x] Every M1b ✅ criterion checked off by the user
**Dependencies:** T4
**Files:** `PLAN.md`, `CLAUDE.md`, `tasks/todo.md`
**Scope:** XS

### Checkpoint B (M1b complete)
- [x] `pnpm check` green; user browser check passed
