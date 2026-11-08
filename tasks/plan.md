# Implementation Plan: M5 (house massing)

Spec: PLAN.md §5 M5 (approved 2026-11-08), ADR 0005. Task checklist: `tasks/todo.md`.
M4a's plan is in git history (merged to `main` as e859430).

## Overview
The house is an ordered list of blocks saved in `dancefloor.json` (`house: { blocks, hiddenOpenings }`): one `gable`
main body built from the roof plan (PAB-03) with a button, plus `flat` polygon blocks drawn in Design with endpoint
snapping (annex, terrace roof, posts). Environment shows them as grey solids. Openings come from the placed
elevations' glazing/door pieces, are placed on the first block face behind each elevation plane, and can be hidden.

## Architecture decisions
- **Pure maths in `src/house/`:** `blocks.ts` (types, strict parse, "Z rzutu dachu" from a normalized sheet, and
  block → triangle positions), `openings.ts` (elevation pieces → rects → 3D quads; ray vs block triangles). No React,
  no three objects, no I/O. Openings are placed against the same triangles the mesh draws, in pure code, so placement
  doesn't depend on the scene graph being built (no R3F timing, no BVH: a few hundred triangles).
- **House state lives in `src/state/store.ts`** next to `sheets` and `groups`: it is part of `dancefloor.json`, so it
  uses the existing `dirty` flag and "Zapisz" (no autosave, unlike edit versions). `projectFile.ts` gains the optional
  `house` field; `version` stays 1.
- **Gable geometry:** walls = box from `bottom` to the wall-face height; gable triangles on the short ends; two roof
  quads from ridge to eave, extended by `overhang` on the long sides (eave height = wall face − overhang × tan pitch).
  Roof drawn double-sided. One `BufferGeometry` for all blocks, flat normals, rebuilt when blocks change.
- **Drawing tool** is a sibling of `MeasureTool` in the Design half (reuses `snap.ts` pick logic). Footprint
  outlines in Design are lines on `DESIGN_LAYER` at z = 0.
- **Level picker:** heights are typed; a small datalist offers the level values from the M2 labels (no new parsing).
- **Pitch parse:** `NN°` from the roof sheet's normalized texts (MTEXT already stripped).

## Task list
See `tasks/todo.md`: T1 main body from the roof plan (model, save, mesh, toggle, panel line), T2 draw/edit flat
blocks, checkpoint A, T3 openings from elevations, T4 hide/show openings + docs, checkpoint B (merge).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Gable maths off (axis, overhang, eave height) | Med | Panel shows wall-face height and pitch; ✅ compares against PAB-10/PAB-08 underlays (< 1 cm) |
| Drawing tool clashes with measure/align pointer handling | Med | One active Design tool at a time (starting one ends the others), same pattern as align vs measure |
| Openings land on the wrong face (annex in front of main body, terrace roof slab) | Med | Ray through the rect centre, first hit; counts "not placed" per elevation; hide list for leftovers |
| Merged/false openings (PAB-08 gable + roof windows) | Low | Known from the facts; hidden by the user, the hidden list is saved |
| Saving `house` breaks old project files | Low | Field optional, parsed strictly only when present |
