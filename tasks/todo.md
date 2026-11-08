# M5 task list

Next: M5 done (user check 2026-11-08: "looking good"). Next milestone M4b (PLAN.md §5): sharpen the spec with `spec-driven-development`, then a new task list.
T4 note: hidden openings still count in "znalezione", not in "bez ściany"; stale keys (rect moved > 1 cm in the DWG) are kept in the file but match nothing.
T3 note: pieces are joined where their boxes touch (the garage door's panel lines end mid-frame); counts 6/8/7/1 as specified. Rays start 0.3 m in front of the elevation plane (PAB-08's plane is 1 cm inside the gable).
T6 note: openings cut the wall lines (plans draw lines across some openings: garage door, podcień doors) and get sill/head fills; a cut needs a wall face within 0.25 m of where the opening was placed (roof windows stay dark quads). West recess (0.60 m, under the terrace roof) found too; soffits via `soffitFrom`.
T2 note: "Z rzutu parteru" (ADR 0005 amendment) builds the annex, the terrace slab (L, 31.90 m²), the deck (52.20 m²), 2 posts, 1 pier and 7 S-COLS columns from PAB-01, heights read from the elevations/section (annex +3.59, slab +2.635…+3.22, posts −0.02…+2.635, columns −0.02…+2.63).
T2 note: the slab carries the awning opening as `holes` (6.93 × 2.14 m, net 17.07 m²).
Real-file checks without the browser: Node 24 runs `src/` TS directly with a resolver hook adding `.ts` to extensionless imports; load a DWG via `@mlightcad/libredwg-web` + `normalize()` in a scratchpad script (never in the repo, never commit `dwg/`).
T1 note: Design also shows the block edges (not solids), so they can be compared with the elevation underlays.
Plan: `tasks/plan.md`. Spec: PLAN.md §5 M5, ADR 0005. M4a task notes are in git history (`tasks/todo.md` at e859430).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Main body from the roof plan
**Description:** Pure `src/house/blocks.ts`: block types (`gable`, `flat`), strict parse, "Z rzutu dachu" from the
horizontal sheet with an `A-ROOF` layer (rect = `A-ROOF` extent, overhang from `A-ROOF-OTLN`, ridge = sheet z, pitch
from the `NN°` label, fallback 38 flagged), and block → triangles. `dancefloor.json` gets optional `house`; store
holds it (dirty + Zapisz). `src/scene/HouseMesh.tsx` draws the solids in Environment, toggle "Dom" next to "Teren".
`src/ui/HousePanel.tsx`: button "Z rzutu dachu" and one line per block (name, size, heights rel + abs, wall face, pitch).
**Acceptance criteria:**
- [x] "Bryła główna" 14.80 × 10.30 m, ridge +9.12 (364.52), pitch 38°, wall face +5.10, overhang 0.16 m
- [x] Its outline matches PAB-10 and PAB-08 underlays (< 1 cm by measuring); Zapisz + reload brings it back
- [x] "Dom" toggles the solids; Design, Podgląd and versions unchanged
**Verification:** `pnpm check`; user builds the main body, compares with the elevations, saves, reloads.
**Dependencies:** none
**Files:** `src/house/blocks.ts`, `src/project/projectFile.ts`, `src/state/store.ts`, `src/scene/HouseMesh.tsx`, `src/scene/Viewport.tsx`, `src/ui/HousePanel.tsx`, `src/ui/strings.ts`
**Scope:** L (mostly small files)

### Task 2: Draw and edit flat blocks
**Description:** `src/scene/HouseDrawTool.tsx` (Design half): "Dodaj blok" → click corners with endpoint snapping,
close by clicking the first corner or Enter, Esc cancels, Backspace drops the last corner; outline + edge lengths while
drawing. New block "Blok n", bottom −1.40, top +3.00. Footprint outlines of all blocks in Design while the panel is
open. Panel: rename, edit heights (datalist of M2 level values), "Rysuj ponownie" (keeps heights), delete.
**Acceptance criteria:**
- [x] Annex drawn on PAB-01 `A-WALL` corners with top +3.59; terrace slab +2.635…+3.22 and two posts drawn the same way
- [x] Re-draw keeps heights; delete removes the block; changes survive Zapisz + reload
- [x] In a version, Wyrównaj +0.30 next to the south façade meets the wall without a gap
**Verification:** `pnpm check`; user draws the annex, terrace roof and posts, edits, re-draws, deletes one, reloads.
**Dependencies:** T1
**Files:** `src/scene/HouseDrawTool.tsx`, `src/scene/Viewport.tsx`, `src/state/store.ts`, `src/ui/HousePanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Checkpoint A (after T1–T2)
- [x] `pnpm check` green; the massing is recognisable and aligned with the plans and elevations (user check)

### Task 3: Openings from the elevations
**Description:** Pure `src/house/openings.ts`: per placed elevation, `A-GLAZ*` + `A-DOOR*` (not the swing layer)
pieces joined within 5 mm, bboxes ≥ 0.3 × 0.3 m, overlapping ones merged; mapped to 3D on the elevation plane, then
moved along the view direction to the first block triangle hit by a ray through the centre (≤ 20 m, else "not
placed"). Drawn in Environment as dark quads 1 cm proud of the face. Panel line per elevation: found / drawn / not placed.
**Acceptance criteria:**
- [x] PAB-10: 6 openings on the south face (terrace door under the terrace roof); PAB-09 8, PAB-08 7, PAB-07 1 found
- [x] Openings sit on recessed faces too (annex vs main body), none floating in front
**Verification:** `pnpm check`; user orbits round the house and reads the counts.
**Dependencies:** T2
**Files:** `src/house/openings.ts`, `src/scene/HouseMesh.tsx`, `src/ui/HousePanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 5 (M5b): Walls from the plans' wall lines
**Description:** Pure `src/house/walls.ts`: storeys = placed plans with wall layers, by z; each `I-WALL`, `I-WALL-1`,
`A-WALL`, `A-WALL-1` line (< 2 cm and cross-layer duplicates dropped) → a double-sided vertical face from the storey z
to the next storey's z; top storey up to the gable roof planes (split at the ridge); exterior lines on the ground
storey from the block bottom; lines in the annex up to its top; lines in no house block skipped. Environment draws
the walls instead of the main body / annex solids (roof planes kept). Panel: per storey faces, length, skipped.
**Acceptance criteria:**
- [x] Zoomed in, PAB-01 partitions and the east podcień wall stand where the plan draws them; attic gable walls reach the ridge, knee walls meet the roof
- [x] From outside the house still matches the renders
**Verification:** `pnpm check`; real-file counts by script; user zooms in.
**Dependencies:** T3 (shares the Environment drawing), T2
**Files:** `src/house/walls.ts`, `src/scene/HouseMesh.tsx`, `src/ui/HousePanel.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 6 (M5b): Slabs, opening fills, camera inside
**Description:** Slabs from the sections (`A-FLOR-2`): ceiling over the main body (+2.82 → +3.29), annex roof
(+2.82 → top), ground slab (0.00 → −0.45). Each T3 opening on a plan gap gets sill/head fills through the wall
thickness. Double-click in Environment sets the orbit point.
**Acceptance criteria:**
- [x] South windows are holes with sill and head as on PAB-10; the garage door hole as on PAB-08; ceilings at +2.82
- [x] Double-click on a wall inside → orbiting around it
**Verification:** `pnpm check`; user walks through living room, attic, garage.
**Dependencies:** T5
**Files:** `src/house/walls.ts`, `src/house/openings.ts`, `src/scene/HouseMesh.tsx`, `src/scene/Viewport.tsx`, `src/ui/HousePanel.tsx`
**Scope:** M

### Task 4: Hide openings, docs
**Description:** Opening list in the panel (per elevation, size, hide/show); hidden keys (sheet + rect to 1 cm) saved
in `house.hiddenOpenings`. PLAN.md M5 done, CLAUDE.md status, this list.
**Acceptance criteria:**
- [x] The merged PAB-08 box can be hidden; hiding survives Zapisz + reload; the hidden count shows
**Verification:** `pnpm check`; user hides, saves, reloads.
**Dependencies:** T3
**Files:** `src/ui/HousePanel.tsx`, `src/state/store.ts`, `src/project/projectFile.ts`, `src/scene/HouseMesh.tsx`, `PLAN.md`, `CLAUDE.md`
**Scope:** S–M

### Checkpoint B (after T3–T4)
- [x] `pnpm check` green; the M5 ✅ in PLAN.md verified by the user; PLAN.md/CLAUDE.md status updated; merge
