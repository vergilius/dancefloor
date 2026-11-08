# Implementation Plan: M4b (bevel + retaining wall)

Spec: PLAN.md §5 M4b (approved 2026-11-08). Task checklist: `tasks/todo.md`.
M5's plan is in git history (merged to `main` as 425d2a9).

## Overview
Each edit's 4 rect edges get a mode: Uskok (step, as M4a), Skarpa (slope 1:n outside the rect, daylighting to the
surface) or Mur (0.25 m wall on the high side, drawn as a solid, terrain keeps the step). One ratio per edit.

## Architecture decisions
- Edges live on the edit (`edges`, `slope`, both optional), so the file stays `version: 2` and M4a files load as all
  Uskok. No new tool, no new store slice for geometry.
- The slope is computed inside `replay` (pure, `src/versions/edits.ts`), so the edit's cut / fill, totals and Różnice
  include it for free. Per outside corner: nearest rect-edge corner p, d = |k − p|, fill: max(h, top − d/n), cut:
  min(h, top + d/n). The outside band is bounded by n × (largest |top − surface| along the edges) + 1 cell, clipped to
  the grid, to stay < 30 ms.
- Walls are derived, never stored: pure `src/versions/walls.ts` reads the version surface along a Mur edge (high side
  top, low side bottom) → segments for the mesh + length / height / m³ for the panel.
- Edge changes go through the existing `command()` undo stack (one step per change).

## Task list
- T1 Skarpa per edge (edit data + replay + edit-list controls) — M
- T2 Edge mode for new edits in the bar (default Skarpa 1:2) + edge hover outline — S/M
- Checkpoint A: slopes end to end (browser check)
- T3 Mur: wall geometry, mesh in Environment, wall lines in the list — M
- Checkpoint B: M4b ✅ (browser check), PLAN.md / CLAUDE.md status, merge

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Replay too slow with wide slopes (n = 3, Δ 2 m → 6 m band) | Med | bounded band per edit; time it in the bar's status if > 30 ms |
| Corner zones with mixed signs (top above ground on one side, below on the other) look odd | Low | per-corner fill/cut rule is local; visible in Różnice, judged in the browser check |
| Wall face vs the one-cell step strip outside the edge (z-fighting / sliver) | Low | wall on the high side, face exactly on the edge line; the strip lies outside it |
| Float32 heights vs exact volume figures | Low | same `Math.fround` path as M4a |
