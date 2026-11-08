# Implementation Plan: M3 (terrain grid)

Spec: PLAN.md §5 M3 (facts, requirements, ✅), ADR 0002. Task checklist: `tasks/todo.md`.
M2's plan is in git history (merged to `main` as 77551df).

## Overview
Existing terrain from the `PZT_TEREN ISTNIEJĄCY` profiles of the placed elevations and sections: profile segments →
plan-coord seed points → delaunator → 0.10 m height grid (`terrain.base`) over the plot bbox, flat extrapolation
outside the hull flagged uncertain. Drawn in the Environment viewport with contours. Generated on load, never saved
(ADR 0002). Best available, not exact (user): no conflict handling between sources.

## Architecture decisions
- **Pure maths in `src/terrain/`:** `seeds.ts` (chain, drop isolated, densify, map to plan) and `grid.ts`
  (triangulate, rasterize, extrapolate, sample). No React, no three. Results surface as counts and values in a panel.
- **Main thread, derived state:** one hook `useTerrain()` (`src/state/terrain.ts`) memoizes seeds + grid from the
  drawn sheets. Recomputed only when sheets/placements change. ~133k cells + a few hundred seeds is well under 100 ms.
- **Drawn sheets move out of `Viewport.tsx`** into `src/state/drawn.ts` (`useDrawnSheets`), so the panel and the
  scene derive terrain from the same placements.
- **Grid layout:** `{ cell, origin (min x, min y), cols, rows, base: Float32Array (corner heights, row-major),
  uncertain: Uint8Array }`. Heights rel ±0.00 in m. Cell corners = mesh vertices, so the mesh needs no resampling.
- **New dependency: `delaunator`** (in the planned stack, PLAN.md §3).
- **Rendering:** one indexed `BufferGeometry` (vertex colours: height tint, lighter where uncertain), environment
  layer only. Contours by marching squares on the same grid, one `LineSegments` (0.25 m), one thicker set (1 m).
  Plot outline from `PZT_ZAKRES` through PZT-01's transform, environment layer.

## Task list
See `tasks/todo.md`: T1 seeds + panel, T2 grid + Ti check, checkpoint A, T3 mesh + toggle + outline, T4 contours,
checkpoint B (merge).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Elevation/section 15–18 cm conflicts make spikes near crossings | Low (best available) | Accepted (user). Visible in the mesh; Ti check guards the corners |
| Ti points miss 2 cm because the grid samples between profile vertices | Med | Bilinear sample of the grid at the Ti point; 0.10 m cells on a ≤ 1 m densified line stay well under 2 cm on these slopes |
| PZT-01 not aligned → no plot outline | Low | Fallback extent: seed bbox + 5 m (spec), panel says which extent is used |
| Translucent uncertain cells sort badly against opaque ones | Low | Lighter colour + one material with per-vertex alpha, or two meshes; pick the simpler that looks right |

## Open questions
None.
