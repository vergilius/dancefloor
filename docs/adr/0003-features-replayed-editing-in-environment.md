# ADR 0003: Features replayed over the generated terrain, editing in Environment

Date: 2026-11-08 · Status: proposed (M4a spec, awaiting user approval)

## Context
ADR 0002 left open whether the environment copy is saved as a snapshot grid or as features replayed over a
regenerated `base`. ADR 0001 put all tools in the Design viewport so far. M4a adds the first editing tools.

## Decision
- **Features, replayed:** `dancefloor.json` saves the ordered feature list only. On load, `base` is regenerated from
  the DWGs (ADR 0002) and the features are applied over it; the "copy" of ADR 0002 is that result, never stored.
- **Editing in the Environment viewport only** (user, 2026-11-08). Design keeps the drawing tools (align, measure).

## Consequences
- The JSON stays small and readable; a feature is editable forever (no baked-in heights).
- If the DWG profiles change, the existing terrain under the features changes with them, and so do the volumes.
  Acceptable: revised DWGs are out of scope for now (PLAN.md §7) and the features keep their own heights.
- The edit tools need picking on the terrain mesh (three-mesh-bvh, already in the planned stack).
- Alternative rejected: snapshot grid (≈ 0.5 MB of floats per save, edits no longer re-editable as features).
