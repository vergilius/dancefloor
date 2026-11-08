# M4b task list

Next: Task 3 (Mur). Checkpoint A passed (user 2026-11-08: "fine for now"; T1, T2 and the Wyrównaj start-height change accepted). Also added: WASD + Q/E camera keys (`src/scene/KeyPan.tsx`), plot margin 5 m. Spec PLAN.md §5 M4b; plan `tasks/plan.md`.
Later (user 2026-11-08): the left sidebar is poor UI/UX (the version panel sits below the long sheet list); address after M4b.
Plot margin now 5 m (user 2026-11-08): only Podgląd and new versions; existing versions keep their frozen grid.
Bundle: index 1495 kB of the 1500 kB budget after T2; keep T3 small.
Branch: m4b-spec (includes level-from-start-point). T3 note: the bundle is at 1495 / 1500 kB; keep the wall mesh code small, ask before raising the budget.
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

### Task 3: Mur
**Description:** Pure `src/versions/walls.ts`: for each Mur edge of each edit, sample the version surface on both sides
of the edge (per grid corner along it), high side = top, low side = bottom; wall 0.25 m thick on the high side, face on
the edge line → triangles + { length, hMin, hMax, m³ }. `src/scene/WallMesh.tsx` draws them in Environment (versions
only). Edit list: one line per wall (side, length, height min–max, m³).
**Acceptance criteria:**
- [ ] Switching the terrace's east edge to Mur removes its slope and shows a 0.25 m wall ~0.62 m high, length 6.00 m, ~0.93 m³ in the list
- [ ] The wall sits on the platform side with its face on the edge; Design, Podgląd and cut / fill are unchanged by walls
**Verification:** `pnpm check`; user browser check.
**Dependencies:** Task 1
**Files:** `src/versions/walls.ts`, `src/scene/WallMesh.tsx`, `src/scene/Viewport.tsx`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Checkpoint B: M4b done
- [ ] Full M4b ✅ in the browser; PLAN.md status "done", CLAUDE.md status line; commit, merge to main, safe to /clear
