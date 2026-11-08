# ADR 0002: Generated model, edited as a copy

Date: 2026-11-08 · Status: accepted (user)

## Context
M3 builds the existing terrain from the DWG profiles. Later milestones add more 3D content derived from the drawings
(house massing, M5). PLAN.md §4 sketched `terrain.base` as part of the saved project. The user expects the terrain to
be mostly reshaped in a later 3D editor, and wants that editing kept apart from what the drawings produce.

## Decision
- **Generated model:** everything derived from the DWGs (terrain grid, later massing) is generated on the fly from
  the sheets on load. It is never saved and never edited directly.
- **Environment editor (M4 on):** at any time the user can switch to editing. The editor works on a **copy** of the
  generated model, and only that copy's edits are saved in `dancefloor.json`.
- M3 has no editor, so nothing is copied or saved yet.

## Consequences
- `dancefloor.json` stays small until the editor exists. No grid arrays are saved in M3.
- "Never mutate `terrain.base`" still holds: `base` is the generated model, edits apply to the copy.
- Open for M4: whether the copy is saved as a snapshot grid or as features replayed over a regenerated `base`, and
  what happens to an existing copy when the drawings change (revised DWGs are out of scope for now, PLAN.md §7).
