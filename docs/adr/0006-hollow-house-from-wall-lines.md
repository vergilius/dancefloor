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

## Amendment (user, 2026-11-08: "najprostsza bryła, żeby to nie było takie rozwarstwione … dużo małych artefaktów";
"okna dachowe nie mają otworów")
Every wall line as a face gave layered walls (outer face, layer line, inner face 1 cm apart) and small fragments.
Replaced by:
- **Exterior shell**: one solid wall along each hollow block's outline (main body with its recesses, the annex
  without the edges on the main wall), mitred corners, thickness = the most common `I-WALL` pair distance on the
  ground plan (0.475 m on PAB-01 and PAB-02), from the block bottom to its top (main body: the roof planes, gables to
  the ridge). Façade openings placed on an outline edge (within 0.25 m) cut it: only the wall below the sill and above
  the head stays. This also covers windows sharing one plan gap (the west attic) and lines drawn across openings.
- **Partitions**: pairs of parallel `A-WALL`/`A-WALL-1` lines 5–35 cm apart, inside the shell, nearest partner per
  side; a solid wall over their overlap, storey floor → next storey (top storey: the roof). PAB-01: 74 (67 m),
  PAB-02: 87 (104 m). Single lines and `I-WALL-1` are left out.
- **Roof windows**: an opening on an elevation looking straight at a slope, above the wall face, becomes a hole in that
  roof plane (its heights mapped onto the slope by the pitch). PAB-07: x 8.21…9.08, y −2.71…−1.73; PAB-10: the two
  eave windows' upper parts. Elevations seeing the roof edge-on give none.
- The roof plan (PAB-03) is no storey (it draws walls too); walls never rise above the roof planes.
