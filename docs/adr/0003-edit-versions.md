# ADR 0003: Edit versions — frozen snapshots, area tools, files in the project folder

Date: 2026-11-08 · Status: accepted (user, 2026-11-08)

## Context
ADR 0002 left open how the environment copy is saved. PLAN.md §4/§5 sketched polygon platforms in `dancefloor.json`.
The user (2026-11-08) wants no editing of the live, drawing-derived data at all, several independent edit versions,
and simple area-based terrain tools like old simulation games.

## Decision
- **Generated model is read-only.** Design places the DWGs; Environment previews the generated model live ("Podgląd").
- **Edit versions:** "Nowa wersja" exports a frozen snapshot of the generated terrain. A version is edited, renamed
  and deleted on its own; later DWG changes don't affect it. Many versions per project.
- **Edits are kept as an ordered list** over the version's frozen base (re-editable, undoable, per-edit volumes),
  not baked into the grid.
- **Area tools:** rectangles on a 0.5 m lattice (Podnieś / Obniż / Wyrównaj in M4a; bevel 1:n and retaining wall in
  M4b; textured path in M4c). Not per-cell painting, not drawn polygons.
- **Storage:** files in the project folder, `dancefloor-versions/<id>.json` (edits, autosaved) + `<id>.bin` (frozen
  grid, written once). Not IndexedDB, not `dancefloor.json`.
- **Editing in the Environment viewport only.** Design keeps its drawing tools (align, measure).

## Consequences
- Versions survive clearing browser data and move with the project folder; ≈ 0.7 MB per version.
- A version never picks up corrected drawings; the user makes a new version instead.
- Replaces the polygon platform / `features` sketch in PLAN.md §4 and the old M4 bullets.
- Alternatives rejected: IndexedDB (lost with browser data, not next to the project); baked grid edits (no
  re-editing, no per-edit volumes); features replayed over the live terrain (versions would drift with the drawings).
