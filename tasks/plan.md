# Implementation Plan: M2 (levels & references, measure tool)

Spec: PLAN.md §5 M2 (facts, requirements, ✅). Task checklist: `tasks/todo.md`.
M1c's plan is in git history (merged to `main` as fda9e1a).

## Overview
The worker extracts the ±0.00 reference (`0,00= +355.40 m npm`) and the absolute level labels (Tp/Ti/TpTi/bare)
with their measured point (the leader's circle, not the text). The sheet list shows the agreed reference and
per-sheet counts; resolved points are drawn as 3D markers; one formatter shows every height as rel + abs.
A measure tool "Pomiar" gives 3D/horizontal distance and Δh between two snapped points. Nothing is saved.
The viewport splits into Design (today's content) and Environment (3D volumes, from M3), side by side, one camera
(ADR 0001).

## Architecture decisions
- **Extraction is pure and runs in the worker** (`src/dwg/labels.ts`, structural raw types from `src/dwg/types.ts`,
  no libredwg import). It reads model-space TEXT/MTEXT, CIRCLE, ARC, LWPOLYLINE directly (normalize loses circle
  centres and entity identity). Output goes into `ParseSummary` as `labels: SheetLabels` (sheet coords, m).
  Points are associated per the spec: site = ARC from the label's rectangle to a circle centre; vertical = nearest
  same-layer circle with |y − (value − ref)| ≤ 1 cm. That rule needs the reference, and the worker only sees one
  sheet, so it uses the sheet's own reference value. All 4 elevations carry 355.40 themselves; a vertical sheet
  without one keeps its labels unresolved (counted).
- **Reference** (`src/project/levels.ts`, pure): agreement over all parsed sheets' reference values (1 mm tolerance)
  → `{ ok, value, sheets }` or a flag. One formatter `formatHeight(rel, ref?)` → `+3.29 (358.69 m n.p.m.)`, or rel
  only when the reference is missing.
- **Plan coords** reuse `sheetToWorld` with the sheet's current placement (site: horizontal + transform; vertical:
  origin + x·dir, height = y). No placement → no markers.
- **Markers:** one r3f component, a small sphere + troika label per resolved point. Toggle `showLevels` is a view
  setting in the store (default on, not saved).
- **Measure tool:** store state `measure` like `align` (picks A, B; Esc clears). Hit = ray against the planes of the
  visible drawn sheets (horizontal z / vertical plane), nearest hit wins; snap to that sheet's visible segment
  endpoints and to the markers within N screen px (same approach as `AlignTool`, generalised `endpoints()` to any
  placement). Readout in a small HTML overlay.
- **Two viewports** (ADR 0001): one `Canvas`, two scissored renders per frame with the same camera; objects
  assigned by three.js layer; pointer events mapped to the half under the cursor. Markers in both, measure in Design.

## Task list
See `tasks/todo.md` (T1–T6, checkpoints A and B).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| ARC/CIRCLE in OCS (extrusion −z mirrors x) | Med | Same OCS handling as `normalize`; counts and marker positions are visible in the browser check |
| ARC end vs rectangle edge tolerance on PZT-01 | Med | Spec measured < 1 mm; use 5 mm, show 7/7 count |
| Label texts may sit inside INSERTs on some sheet | Low | Spec facts say model-space entities; counts would show 0 and we look then |
| Split view: per-half aspect, ortho frustum and pointer mapping (r3f assumes one full-canvas view) | Med | Isolated in `src/scene/split.ts`; align tool rerun as the check |
| Ray hit on overlapping sheets in perspective view | Med | Nearest hit along the ray; snap radius in screen px; user checks the three ✅ measurements |

## Open questions
- None blocking. Bare labels stay `bare` (M3 decides).
