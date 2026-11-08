# M4a task list

Next: T1 implemented (commit "M4a T1"), waiting for the user's browser check; then T2.
Plan: `tasks/plan.md`. Spec: PLAN.md §5 M4a, ADR 0003. M3 task notes are in git history (`tasks/todo.md` at c477be0).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Edit versions, stored in the project folder
**Description:** Pure `src/versions/file.ts` (version JSON parse/serialize, `.bin` = base Float32 + uncertain Uint8)
and folder helpers for `dancefloor-versions/`. Store `src/state/versions.ts`: list loaded on folder open, `active`
('preview' | id), create ("Nowa wersja" = copy of the generated grid, named "Wersja n", opened), rename, delete
(confirm, removes both files). Environment view bar: selector Podgląd | versions + the three buttons. `TerrainMesh`
draws the active source via `useEnvSurface()`. Panel line for the active version: name, grid size, edits 0, saved.
**Acceptance criteria:**
- [ ] Nowa wersja → files appear in `dancefloor-versions/`; the version looks identical to Podgląd
- [ ] Rename and delete work and persist across a reload; unreadable files are flagged, not deleted
- [ ] Design and Podgląd unchanged
**Verification:** `pnpm check`; user creates, renames, deletes, reloads, and looks in the folder.
**Dependencies:** none
**Files:** `src/versions/file.ts`, `src/project/folder.ts`, `src/state/versions.ts`, `src/scene/Viewport.tsx`, `src/scene/TerrainMesh.tsx`, `src/ui/strings.ts`
**Scope:** M–L

### Task 2: Wyrównaj by dragging a rect, totals, autosave
**Description:** Add `three-mesh-bvh`. Pure `src/versions/edits.ts`: lattice snap (0.5 m, anchored at plan 0, 0),
apply edits in order over the frozen base (corners inside the rect, edges included), totals cut / fill / net and
uncertain share. `src/scene/EditTool.tsx`: with "Wyrównaj" active in a version, drag on the terrain → snapped rect
draped on the surface with its size; release → edit with z = mean height under the rect (1 cm). Panel: totals line,
numeric z of the last edit. Autosave the JSON 1 s after a change; save errors in the bar.
**Acceptance criteria:**
- [ ] 4 × 6 m rect → 24.00 m²; z +0.30 → +0.40 grows net by ≈ 2.40 m³
- [ ] Mesh and contours show the levelled area; a reload brings the edit back
**Verification:** `pnpm check`; user drags, reads totals, changes z, reloads.
**Dependencies:** T1
**Files:** `package.json`, `src/versions/edits.ts`, `src/scene/EditTool.tsx`, `src/state/versions.ts`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M–L

### Checkpoint A (after T1–T2)
- [ ] `pnpm check` green; versions persist and the volume check holds (user check)

### Task 3: Podnieś / Obniż and the edit list
**Description:** Tools Podnieś and Obniż (dz default 0.10 m). Panel list of the active version's edits: tool, size,
dz or z (rel + abs), cut / fill against the surface before it. Select → rect outlined in the view; change dz / z;
delete.
**Acceptance criteria:**
- [ ] Podnieś 1 × 1 m by 0.10 → net +0.10 m³ (± one cell row); Obniż mirrors it
- [ ] Changing or deleting an earlier edit replays the later ones; totals follow
**Verification:** `pnpm check`; user stacks edits, changes and deletes one.
**Dependencies:** T2
**Files:** `src/versions/edits.ts`, `src/scene/EditTool.tsx`, `src/state/versions.ts`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 4: Undo/redo and the Δh map
**Description:** Per-version command stack over add / change / delete (Ctrl+Z, Ctrl+Shift+Z, buttons), cleared on
folder load. Toggle "Różnice": vertex colours by Δh = surface − frozen base (red cut, blue fill, white 0, saturated
±1.0 m) with a small legend.
**Acceptance criteria:**
- [ ] Undo/redo restore totals exactly; a second version keeps its own history and totals
- [ ] Różnice shows red/blue where expected; off = M3 height tint
**Verification:** `pnpm check`; user undoes/redoes across two versions, toggles Różnice, orbits (smooth).
**Dependencies:** T3
**Files:** `src/state/versions.ts`, `src/scene/TerrainMesh.tsx`, `src/scene/Viewport.tsx`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Checkpoint B (after T3–T4)
- [ ] `pnpm check` green; the M4a ✅ in PLAN.md verified by the user; PLAN.md/CLAUDE.md status updated; merge
