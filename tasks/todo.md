# M1c task list

Next: plan written, waiting for user approval. Then Task 1.
Note (spec): data facts and expected values are in PLAN.md §5 M1c (PZT-01: rotation −11.27506°, scale 1,
translation 0, 66 % endpoints matched; tank at plan x 8.785–11.785, y −15.838…−13.438).
M1b task notes are in git history (`tasks/todo.md` at 237fd7b).

Commands: `pnpm dev`, `pnpm check` (build + lint + guards). No automated tests (CLAUDE.md).
Every task: typecheck, lint and build green, and a "verify in browser" checklist goes to the user.

---

### Task 1: Auto-alignment of site sheets (values only)
**Description:** Pure `src/project/align.ts` (Similarity2D apply/invert/fromTwoPairs, `autoAlign`). `src/state/site.ts`
derives and caches it against the reference plan. Site sheets auto-parse on open. The sheet list shows, per site sheet,
rotation (°), scale, translation (m) and matched share, or the reason it failed.
**Acceptance criteria:**
- [ ] PZT-01 shows rotation −11.275° (±0.01°), scale 1.000, translation ≈ (0, 0), share ≈ 66 %
- [ ] A site sheet with too few matches shows a reason and no transform
**Verification:** `pnpm check`; user opens the folder and reads the values.
**Dependencies:** none
**Files:** `src/project/align.ts`, `src/state/site.ts`, `src/state/store.ts`, `src/ui/SheetList.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 2: Draw site sheets through their transform
**Description:** Horizontal `SheetPlacement` gets an optional transform applied in `sheetToWorld`; texts add its
rotation/scale. `Viewport` draws site sheets at z 0 with the derived transform (layer panel and groups apply).
**Acceptance criteria:**
- [ ] Top view: PZT-01 `A-WALL` lies on PAB-01's walls (< 2 cm); texts upright and unmirrored
- [ ] Layer/group toggles work on PZT-01
**Verification:** `pnpm check`; user checks the top view.
**Dependencies:** T1
**Files:** `src/scene/coords.ts`, `src/scene/SheetTexts.tsx`, `src/scene/Viewport.tsx`
**Scope:** S

### Task 3: Save the transform, Reset
**Description:** `projectFile.ts` accepts and validates `transform` (and horizontal `placement`) for `site` and `pdf`.
"Zapisz" writes the derived transform if none is saved; a saved one wins. Reset in the sheet list (site: back to auto).
**Acceptance criteria:**
- [ ] After save + reload PZT-01 uses the saved transform (not re-derived); the JSON holds `{ scale, rotation, translate }`
- [ ] Reset removes the saved transform and marks the project dirty
**Verification:** `pnpm check`; user saves, reloads, inspects `dancefloor.json`.
**Dependencies:** T2
**Files:** `src/project/projectFile.ts`, `src/state/store.ts`, `src/state/site.ts`, `src/ui/SheetList.tsx`
**Scope:** S

### Checkpoint A (after T1–T3)
- [ ] `pnpm check` green; PZT-01 aligned automatically and the alignment survives reload (user check)

### Task 4: Obstacles group
**Description:** New layer group `obstacles` ("Przeszkody"): `PZT_GAZ*`, `PZT_WODA P`, `PZT_KAN*`, `PZT_PRĄD`,
`A-DETL-2`, before the `details` rule. Its layers are drawn in one warning colour.
**Acceptance criteria:**
- [ ] The tank rectangle shows at plan x 8.8–11.8, y −15.8…−13.4 in the obstacle colour, with the utility lines
- [ ] The group toggles on/off and is saved like the other groups
**Verification:** `pnpm check`; user checks the top view and the layer panel.
**Dependencies:** T2
**Files:** `src/project/layerGroups.ts`, `src/scene/SheetObject.tsx`, `src/scene/Viewport.tsx`, `src/ui/strings.ts`
**Scope:** S

### Task 5: PDF underlay
**Description:** Add `pdfjs-dist`. Render page 1 to a texture (~200 dpi, clamped to max texture size) and draw it as
a quad at z −0.02 through the PDF's transform (placeholder 1:500 sheet coords). The sheet list shows the rendered size.
**Acceptance criteria:**
- [ ] The survey map shows in the top view, near the house at roughly the right size, under the lines
- [ ] The sheet list shows the rendered pixel size; no console errors
**Verification:** `pnpm check` (bundle budget); user checks the top view.
**Dependencies:** T2
**Files:** `package.json`, `src/pdf/render.ts`, `src/scene/PdfObject.tsx`, `src/scene/Viewport.tsx`, `src/ui/SheetList.tsx`
**Scope:** M

### Task 6: 2-point tool
**Description:** "Wyrównaj" on a site/PDF row starts the tool in the top view: A on the sheet → A′ on the reference →
B → B′. Endpoint snapping (source: the sheet's own endpoints, target: other visible horizontal sheets), snapped point
shown, Esc cancels. `fromTwoPairs` gives the transform, applied live, project marked dirty.
**Acceptance criteria:**
- [ ] On PZT-01, two wall corners → rotation −11.275° (±0.01°), scale 1.000, translation within 1 cm of auto
- [ ] On the PDF, two house corners → the PDF house outline visibly matches PZT-01; scale shown
- [ ] Esc cancels without changing the transform
**Verification:** `pnpm check`; user runs the tool on both sheets.
**Dependencies:** T3, T5
**Files:** `src/scene/AlignTool.tsx`, `src/scene/snap.ts`, `src/state/store.ts`, `src/ui/SheetList.tsx`, `src/ui/strings.ts`
**Scope:** M

### Task 7: M1c acceptance
**Description:** Final browser check against the M1c ✅ in PLAN.md; mark M1c done in PLAN.md and CLAUDE.md.
**Acceptance criteria:**
- [ ] Every M1c ✅ criterion checked off by the user
**Dependencies:** T4, T6
**Files:** `PLAN.md`, `CLAUDE.md`, `tasks/todo.md`
**Scope:** XS

### Checkpoint B (M1c complete)
- [ ] `pnpm check` green; user browser check passed
