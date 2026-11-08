# Implementation Plan: M4a (edit versions + editor core)

Spec: PLAN.md §5 M4a (approved 2026-11-08), ADR 0003. Task checklist: `tasks/todo.md`.
M3's plan is in git history (merged to `main` as f22b33e).

## Overview
Environment gets a source selector: "Podgląd" (the generated terrain, live, read-only, as in M3) or an edit version.
A version is a frozen copy of the generated grid plus an ordered list of rect edits (Podnieś / Obniż / Wyrównaj on a
0.5 m lattice), stored as `dancefloor-versions/<id>.json` + `<id>.bin` in the project folder, JSON autosaved.
Volumes against the version's frozen base, Δh colour map, undo/redo.

## Architecture decisions
- **Pure maths in `src/versions/`:** `edits.ts` (types, lattice snap, apply in order → surface + per-edit cut/fill,
  totals) and `file.ts` (JSON parse/serialize, .bin pack/unpack). No React, no three, no I/O.
- **Folder I/O** next to the existing helpers: `src/project/folder.ts` gains small read/write/remove helpers for the
  `dancefloor-versions/` subfolder (the handle is already `readwrite`).
- **Own zustand store `src/state/versions.ts`:** versions (meta + frozen grid + edits), `active: 'preview' | id`,
  active tool, undo/redo stacks per version, save status. Keeps `store.ts` (sheets, M1–M3) unchanged except a hook
  into folder open. Autosave = a debounced subscription (1 s) writing the active version's JSON.
- **One surface hook:** `useEnvSurface()` returns the grid to draw: the generated one in Podgląd, or the active
  version's replayed surface (+ Δh). `TerrainMesh` and contours draw whatever it returns, so preview and versions
  share the M3 rendering. Edits apply on release (not during the drag), so geometry is rebuilt per edit, not per frame.
- **Picking:** a ray marched over the version's height grid (`rayGrid`, pure), Environment half only. No `three-mesh-bvh`:
  the terrain is a heightfield, so the BVH isn't needed (keep it in mind for picking the house, M5).
  The drag rect preview is a line loop draped on the surface (like the plot outline).
- **Undo/redo:** commands store the edit list before/after (edits are tiny), one command per add / change / delete.

## Task list
See `tasks/todo.md`: T1 versions (create, list, rename, delete, files, show frozen terrain), T2 Wyrównaj via rect
drag + totals + autosave, checkpoint A, T3 Podnieś/Obniż + edit list (select, change, delete, per-edit volumes),
T4 undo/redo + "Różnice" Δh map, checkpoint B (merge).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Split-viewport pointer events (ADR 0001) don't reach an Environment-layer mesh | Med | T2 starts with picking; check `splitEvents` raycaster layers for the env half first |
| Rebuilding mesh + contours per edit is slow (134k corners) | Low | Rebuild on release only; contours ≈ 14 levels of marching squares; measure in T2 |
| Volume maths silently off (edge corners, lattice snap) | Med | Visible checks in the ✅: 4 × 6 m = 24.00 m², +0.10 m → +2.40 m³, 1 × 1 m → 0.10 m³ |
| Autosave races (rename/delete while a write is pending) | Low | One write queue per version; delete cancels its pending write |
| Frozen .bin and JSON grid geometry disagree | Low | JSON stores cols/rows; .bin length checked on load, mismatch = version flagged unreadable |

## Open questions
None.
