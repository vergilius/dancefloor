# ADR 0005: House massing from blocks (main body from the roof plan, the rest drawn), openings from elevations

Date: 2026-11-08 · Status: accepted (user, 2026-11-08)

## Context
PLAN.md §5 M5 planned footprints as closed loops found in the `A-WALL` LINEs. On the real PAB-01 that doesn't work:
246 segments, 186 open ends, no closed loop even at 10 mm tolerance. The user picked "auto-trace, then fix by hand";
three throwaway prototypes (2026-11-08, scratchpad only) all leaked into the house:
- raster of walls + glazing + doors, closing 0–10 cm, flood from outside: 24–32 m² "inside" instead of ≈ 190 m²
  (entry doors are drawn open, so openings stay open);
- bridging collinear open wall ends across gaps ≤ 3 m: 44 of 93 gaps closed (0.01–2.79 m), still leaks;
- gaps ≤ 6 m and 5–15 cm offset: no better (the ≈ 4.5 m west glass wall and the garage door have offset frame ends).
Making it work would mean file-specific heuristics that fail silently. Meanwhile PAB-03's `A-ROOF` extent is exactly
the main walls (14.80 × 10.30 m), and the elevations' glazing/door pieces give the openings well (PAB-10: all 6).

## Decision (user, 2026-11-08: "go with your recommendation")
- **The house is a list of blocks**, saved in `dancefloor.json`: `gable` (rectangle, ridge along the long side) and
  `flat` (polygon prism). Solids overlap freely; no booleans.
- **Main body semi-auto:** one button builds the gable block from the roof sheet (`A-ROOF` extent, `A-ROOF-OTLN` for
  the overhang, sheet z = ridge, pitch from the `38° / 78.13%` label).
- **Other blocks drawn by hand** in Design: click corners with the measure tool's endpoint snapping.
- **Openings automatic** from the placed elevations (`A-GLAZ*`, `A-DOOR*` pieces → rectangles), put on the first block
  face behind the elevation plane. Wrong ones are hidden by the user (hidden list saved), not edited.

## Consequences
- Replaces the `A-WALL` loop detection in PLAN.md §5 M5 and the matching §6 risk.
- About 10 clicks for the annex and the terrace roof; every block stays editable and re-drawable.
- Openings are only as good as the elevations: merged gable/roof windows on PAB-08 and roof windows shown as façade
  openings need hiding.
- IFC remains the better source if it ever arrives (`web-ifc`, PLAN.md §3); then the blocks are replaced.
