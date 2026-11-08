# M4b task list (done 2026-11-08)

Next: M4b done and merged (user 2026-11-08: "all good"). Next milestone M4c (PLAN.md §5): sharpen the spec with `spec-driven-development`, then a new task list. Later: left sidebar UI/UX rework.
Later (user 2026-11-08): the left sidebar is poor UI/UX (the version panel sits below the long sheet list); address after M4b.
Plot margin now 5 m (user 2026-11-08): only Podgląd and new versions; existing versions keep their frozen grid.
Bundle: index 1495 kB of the 1500 kB budget after T2; keep T3 small.
Branch: m4b-spec (includes level-from-start-point). T3 note: scratchpad check (flat −0.32): 0.25 × 6 m wall → default top +0.18, 0.50 m high, 0.75 m³, terrain untouched; old `wall` edge mode reads as step. Bundle 1500 / 1500 kB after wall resize: the next addition needs the budget raised (ask the user, CONSTRAINTS.md); keep the wall mesh code small, ask before raising the budget.
Drawings have no slopes or walls (checked PZT, PAB-11, PAB-12): all M4b geometry is the user's design.
T1 note: scratchpad check on a flat −0.32 grid: 4 × 6 m to +0.30, 1:2 → slope 1.20 m wide (last corner above ground; 1.24 exact), 1:3 → 1.80 m; no edges = M4a fill to 4 decimals; 10 sloped edits (Δ 1.5 m, n = 3) replay in ~14 ms warm (36 ms first run).
Real-file checks without the browser: Node 24 runs `src/` TS directly with a resolver hook adding `.ts` to extensionless imports; load a DWG via `@mlightcad/libredwg-web` + `normalize()` in a scratchpad script (never in the repo, never commit `dwg/`).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Skarpa per edge
**Description:** `Edit` gets optional `edges: { w, e, s, n: 'step' | 'slope' | 'wall' }` and `slope` (n > 0, default 2),
parsed strictly (missing = all step). `replay` applies Skarpa outside the rect (spec rule, bounded band, corner zone only
when both edges slope; Mur behaves as step here). Store: `setEditEdges(id, edges, slope)` through `command()`. Edit list:
4 selects (← → ↑ ↓) and a 1:n field shown when an edge is Skarpa.
**Acceptance criteria:**
- [x] Wyrównaj 4 × 6 m to +0.30 by the south façade, 3 edges Skarpa 1:2: the slope reaches the −0.32 ground ~1.24 m out (measure tool, ± 1 cell); the edit's fill and totals include it; Różnice shows it
- [x] n = 3 widens it to ~1.86 m live; undo / redo restore each change; reload keeps edges and n
- [x] An M4a version (no edges) loads with the same totals as before
**Verification:** `pnpm check`; user browser check.
**Dependencies:** none
**Files:** `src/versions/edits.ts`, `src/state/versions.ts`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 2: Sim-builder interaction (redone twice 2026-11-08: edge selects in the bar rejected; then "select first, drag to elevate, edge tilts")
**Description:** Drag the area → edit added (Wyrównaj flat at the start height), Skarpa all round, selected. Selected
Wyrównaj: drag inside = up / down, drag near an edge = that edge up / down (ramp, `tilt`), click near an edge = cycle
Skarpa → Uskok → Mur. Live preview via `preview` in the store (replaces the dragged edit), `replaceEdit` = one undo step.
**Acceptance criteria:**
- [x] Drag an area: flat at the start height, selected; drag its middle up → platform rises live, release keeps it, Ctrl+Z undoes the whole drag
- [x] Drag the far edge down → ramp; the list shows the 4 edge heights; slopes follow the ramp
- [x] Click an edge (no drag) cycles its mode; the bar's 1:n changes the selected edit live; Esc deselects
**Verification:** `pnpm check`; user browser check.
**Dependencies:** Task 1
**Files:** `src/scene/EditTool.tsx`, `src/versions/edits.ts`, `src/state/versions.ts`, `src/ui/VersionBar.tsx`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Checkpoint A: slopes
- [x] `pnpm check` green; user browser check of T1 + T2; tick boxes, update `Next:`, commit, safe to /clear

### Task 3: Mur (redone 2026-11-08: user draws walls as rectangles, house colour; Mur edge mode dropped)
**Description:** Tool "Mur": drag a rect (5 cm snap) → `{ tool: 'wall', rect, top }` edit, box from the lowest surface
under it to `top` (default highest + 0.50 m) in the house colour (`src/scene/WallMesh.tsx`, pure `src/versions/walls.ts`);
drag it up / down or type top; list shows height above terrain and m³. No terrain change.
**Acceptance criteria:**
- [x] Draw a 0.25 × 6 m wall along the terrace edge: house-coloured box, list shows 0.25 × 6.00 m, height and m³
- [x] Drag it up / down (one undo step), type an exact top; terrain, cut / fill and Design unchanged; reload keeps it
- [x] (user 2026-11-08) click a wall to select it; pull a side to resize it (5 cm); Backspace deletes the selected edit
**Verification:** `pnpm check`; user browser check.
**Dependencies:** Task 2
**Files:** `src/versions/edits.ts`, `src/versions/walls.ts`, `src/scene/WallMesh.tsx`, `src/scene/EditTool.tsx`, `src/ui/VersionPanel.tsx`, `src/ui/VersionBar.tsx`, `src/ui/strings.ts`
**Scope:** M

### Checkpoint B: M4b done
- [x] Full M4b ✅ in the browser; PLAN.md status "done", CLAUDE.md status line; commit, merge to main, safe to /clear
