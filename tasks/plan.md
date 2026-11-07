# Implementation Plan: M1b (elevations and sections on their lines)

Spec: PLAN.md §4 (vertical `placement`), §5 M1b (facts table, requirements, ✅). Task checklist: `tasks/todo.md`.
M1a's plan is in git history (merged to `main` as 032c110).

## Overview
Each elevation/section sheet (PAB-04..10) gets a vertical placement `{ origin, dir }` derived from the ground
plan: the axis and sign from matching `S-GRID-IDEN` labels, the plane position from the section cut lines
(`G-ANNO-SYMB-2`) or the outermost `A-WALL` extent. The sheet is then drawn standing on that plane. Sheets that
can't be placed are flagged with a reason, not drawn.

## Architecture decisions
- **Placement derivation is pure and runs on the main thread** (`src/project/vertical.ts`): input = two
  `NormalizedSheet`s (the reference plan and the vertical sheet) plus the sheet's kind and filename, output =
  `{ placement, info }` or `{ reason }`. No worker changes: everything needed (grid segments, label texts,
  `G-ANNO-SYMB*` segments/texts, `A-WALL` segments) is already in `NormalizedSheet`.
- **Reference plan** = the `plan` sheet with z = 0 (PAB-01). It and the vertical sheets must be parsed, so
  vertical sheets auto-parse on open like plans.
- **Grid line per label**: the nearest `S-GRID-1` line to the label on the same sheet (vertical stubs on
  vertical sheets; on the plan, vertical lines for digits, horizontal for letters). Fit sheet x = s·p + t for
  s = +1 and −1, keep the smaller max residual.
- **Look direction** = (−dir.y, dir.x); viewer side = −look. Elevation plane = `A-WALL` extent furthest towards
  the viewer side.
- **Rendering**: sheet point (x, y) → plan point origin + x·dir at height y → `toScene`. A sibling of
  `planPositions` in `coords.ts`; texts rotated into the plane, facing the viewer side.
- **Persistence**: `placement` in `dancefloor.json` accepts the vertical variant; it is derived only when the
  sheet has no saved placement. The plane position (the component of `origin` along the look direction) is
  editable in the sheet list.

## Task list
See `tasks/todo.md` (T1–T5 with checkpoints).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Wrong sign/axis convention (mirrored sheet) | High: silent | Show look direction in the list; table in PLAN.md gives the expected value per sheet; top-view check of grid stubs |
| Texts on vertical sheets mirrored or facing away | Med | Visible in the browser check from the viewer side |
| Label → grid line association picks the wrong line (labels 0.6 m apart for 1/2, 6/7) | Med | Residual shown per sheet; > 5 mm flags the sheet |
| Section letter on the plan also used elsewhere on `G-ANNO-SYMB` | Low | Only `A`/`B`/`C` exist there now; nearest cut segment to the letter |

## Open questions
None.
