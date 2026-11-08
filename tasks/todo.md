# M3 task list

Next: T1 (terrain seeds + panel line). Plan: `tasks/plan.md`. Spec: PLAN.md §5 M3, ADR 0002.
M2 task notes are in git history (`tasks/todo.md` at 48b5a42).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Terrain seeds from the profiles, panel line
**Description:** Move `useDrawnSheets` from `Viewport.tsx` to `src/state/drawn.ts`. Pure `src/terrain/seeds.ts`:
from each placed elevation/section, the `PZT_TEREN ISTNIEJĄCY` segments; chain by endpoints within 2 cm; drop
segments with no neighbour; densify to ≤ 1 m; map to plan (x, y, h) through the vertical placement. A terrain panel
line: `Teren: n punktów z k arkuszy, m odcinków pominiętych` (per-sheet breakdown on hover/title).
**Acceptance criteria:**
- [ ] 7 sheets contribute (PAB-04..10); dropped: 1 legend segment per elevation + the PAB-08 stub (+ any isolated
      section piece, listed)
- [ ] The Design view is unchanged after the move
**Verification:** `pnpm check`; user reads the panel line and per-sheet counts.
**Dependencies:** none
**Files:** `src/state/drawn.ts`, `src/scene/Viewport.tsx`, `src/terrain/seeds.ts`, `src/state/terrain.ts`, `src/ui/TerrainPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 2: Height grid and the Ti check
**Description:** Add `delaunator`. Pure `src/terrain/grid.ts`: merge seeds within 1 cm, triangulate, rasterize
0.10 m corner heights inside the hull, outside = height of the nearest hull-boundary point, flagged uncertain.
Extent = `PZT_ZAKRES` bbox (through PZT-01's transform) + 2 m, else seed bbox + 5 m. `sampleGrid(x, y)` (bilinear).
Panel: grid size, cell count, extent source, height range (rel + abs), uncertain share; Ti list: each Ti / Tp=Ti
marker's label value vs the grid height at its point, Δ, and max |Δ|.
**Acceptance criteria:**
- [ ] Grid ≈ 310 × 430 from `PZT_ZAKRES`; height range within the profile range (≈ −2.80…+0.63)
- [ ] Ti check: max |Δ| ≤ 2 cm
**Verification:** `pnpm check`; user reads the panel values.
**Dependencies:** T1
**Files:** `package.json`, `src/terrain/grid.ts`, `src/state/terrain.ts`, `src/ui/TerrainPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Checkpoint A (after T1–T2)
- [ ] `pnpm check` green; counts and Ti check match the spec (user check)

### Task 3: Terrain mesh in the Environment viewport
**Description:** `src/scene/TerrainMesh.tsx`: one indexed mesh from the grid corners (environment layer only),
height-tinted vertex colours, uncertain cells lighter and semi-transparent. Plot outline (`PZT_ZAKRES`) on the
environment layer. Toggle "Teren" (store view setting, default on, not saved).
**Acceptance criteria:**
- [ ] Environment shows the terrain under the markers (Ti markers on the surface); Design shows no terrain
- [ ] Uncertain area visibly different; toggle hides/shows terrain and outline
**Verification:** `pnpm check`; user orbits Environment and toggles.
**Dependencies:** T2
**Files:** `src/scene/TerrainMesh.tsx`, `src/scene/Viewport.tsx`, `src/state/store.ts`, `src/ui/LayerPanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 4: Contour lines
**Description:** Pure `src/terrain/contours.ts` (marching squares on the grid corners) → segments at every 0.25 m;
`src/scene/TerrainMesh.tsx` draws them just above the surface, every 1 m thicker/darker. Hidden with the terrain.
**Acceptance criteria:**
- [ ] Contours every 0.25 m, 1 m ones distinct; they follow the profiles (a contour crosses a profile at its height)
- [ ] Orbiting the Environment view stays smooth (60 fps)
**Verification:** `pnpm check`; user orbits and reads a contour vs a Ti marker.
**Dependencies:** T3
**Files:** `src/terrain/contours.ts`, `src/scene/TerrainMesh.tsx`
**Scope:** S

### Checkpoint B (after T3–T4)
- [ ] `pnpm check` green; all M3 ✅ in PLAN.md verified by the user; PLAN.md/CLAUDE.md status updated; merge
