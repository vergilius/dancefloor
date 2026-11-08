# M4b task list

Next: Task 1 (Skarpa per edge). Spec approved 2026-11-08 (PLAN.md §5 M4b); plan `tasks/plan.md`.
Branch: m4b-spec (on top of level-from-start-point: Wyrównaj levels to the drag's start height, browser check pending).
Drawings have no slopes or walls (checked PZT, PAB-11, PAB-12): all M4b geometry is the user's design.
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
- [ ] Wyrównaj 4 × 6 m to +0.30 by the south façade, 3 edges Skarpa 1:2: the slope reaches the −0.32 ground ~1.24 m out (measure tool, ± 1 cell); the edit's fill and totals include it; Różnice shows it
- [ ] n = 3 widens it to ~1.86 m live; undo / redo restore each change; reload keeps edges and n
- [ ] An M4a version (no edges) loads with the same totals as before
**Verification:** `pnpm check`; user browser check.
**Dependencies:** none
**Files:** `src/versions/edits.ts`, `src/state/versions.ts`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 2: Edge mode for new edits + edge hover
**Description:** View bar: "Krawędzie: Uskok | Skarpa 1:n | Mur" next to the tools (remembered in the store, default
Skarpa 1:2); new edits get it on all 4 edges. Hovering an edge select in the list outlines that edge in the view.
**Acceptance criteria:**
- [ ] A new drag with Skarpa 1:2 chosen gets 4 sloped edges; with Uskok it behaves as M4a
- [ ] Hovering "↓" on an edit outlines its bottom edge (as seen in the Design top view)
**Verification:** `pnpm check`; user browser check.
**Dependencies:** Task 1
**Files:** `src/state/versions.ts`, `src/ui/VersionBar.tsx`, `src/scene/EditTool.tsx`, `src/ui/VersionPanel.tsx`, `src/ui/strings.ts`
**Scope:** S/M

### Checkpoint A: slopes
- [ ] `pnpm check` green; user browser check of T1 + T2; tick boxes, update `Next:`, commit, safe to /clear

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
