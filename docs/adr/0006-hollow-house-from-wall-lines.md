# ADR 0006: Hollow house from the plans' wall lines

Date: 2026-11-08 · Status: accepted (user, 2026-11-08)

## Context
M5 (ADR 0005) models the house as solid blocks; wall thickness and the interior were out of scope. The user wants to
put the camera inside and see every wall and the window and door holes (option 1: exterior walls and partitions).
On the real plans the wall layers form no closed pieces (PAB-01 `I-WALL`: 40 pieces, 0 closed, 81 open ends), so
walls can't be found as solids without the heuristics ADR 0005 rejected.

## Decision
- Every wall line of a storey's plan becomes a vertical, double-sided face from the storey floor to the next storey
  (top storey: to the roof planes). Walls drawn with two lines read as thick; plan gaps are the openings.
- Exterior openings get sill and head fills from the elevation rectangles (M5 T3); interior door gaps stay full
  height until their heads are known.
- Slabs from the sections (`A-FLOR-2`), the roof from the existing gable block. Main body and annex are drawn from
  these parts instead of as solids; their blocks stay as data.

## Consequences
- No footprint or loop detection: the model shows exactly what the plans draw, gaps and stray lines included
  (counted in the panel).
- Jambs show where the drawings draw them (`I-WALL` jamb lines); partitions without drawn ends show open edges.
- More triangles (a few thousand), still one geometry per storey.
- Replaces the "wall thickness, interior" exclusion of PLAN.md §5 M5.
