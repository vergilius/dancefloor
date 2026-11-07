# Implementation Plan: M1a (worker, normalization, stacked plans)

Spec: PLAN.md §2 (decisions), §4 (sheet model), §5 M1a. Task checklist: `tasks/todo.md`.

## Overview
The user opens the project folder, the app lists the DWGs and suggests a `kind` and `z` for each, and the
user confirms them. A Web Worker parses each DWG with libredwg-web. A pure normalization step turns the
entities into line and text primitives in metres. The three floor plans are then drawn stacked in 3D, with
a layer panel. The UI is in Polish.

## Architecture decisions
- **Worker boundary.** `src/worker/dwg.worker.ts` is the only module that imports `@mlightcad/libredwg-web`.
  It returns plain JS entities typed by **our own** minimal interfaces (`src/dwg/types.ts`), so the rest of
  the app doesn't depend on libredwg's types either.
- **Normalization is pure** (`src/dwg/normalize.ts`). It takes entities and blocks and returns a
  `NormalizedSheet` in metres. It runs inside the worker, so only compact typed arrays cross the boundary.
  It has no automated tests (CLAUDE.md); its counts are shown in the UI for checking.
- **`NormalizedSheet`**: per layer, one `Float32Array` of line-segment pairs (x, y in sheet coordinates,
  metres), plus a list of texts `{ layer, text (stripped), x, y, height, rotation }`, plus
  `skipped: Record<entityType, count>`. Arcs, circles and splines are tessellated (max chord error 1 mm).
- **Rendering**: one `LineSegments` per (sheet, layer), so toggling a layer flips `visible` on one object.
  Texts via drei `<Text>`.
- **Axes**: three.js uses Y as up. A plan point (x, y) at height z maps to the scene point (x, z, −y).
  This lives in a single helper, `src/scene/coords.ts`.
- **Project file**: `dancefloor.json` in the chosen folder. It holds the sheets
  (`file`, `kind`, `placement`, `transform`, `layers`), versioned with `version: 1`. The directory handle
  is kept in IndexedDB (key `projectDir`).
- **State**: a zustand store for the project and UI state. There is nothing to undo in M1a, so the
  command stack is deferred to M4.
- **Kind/z suggestion** (`src/project/suggest.ts`): pure function, filename → `{ kind, z? }`, rules from
  PLAN.md M1a.

## Task list
See `tasks/todo.md` (10 tasks, 3 checkpoints).

Phase 1, Foundation: T1 scaffold → T2 folder access → T3 worker parse (riskiest: WASM in a Vite worker)
Phase 2, Geometry: T4 basic entities → T5 INSERT expansion → T6 MTEXT
Phase 3, Product: T7 sheet list + project JSON → T8 3D view → T9 layer panel → T10 acceptance on real files

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| libredwg WASM won't load in a Vite module worker (path, MIME, `import.meta.url`) | High | T3 is early. WASM goes in `public/wasm/` and the worker passes an explicit base URL to `LibreDwg.create()` |
| INSERT nesting, mirrored or non-uniform block scale, block base point | Med | Dedicated task (T5); check visually on sheets with mirrored and rotated blocks (doors, windows, grid bubbles) |
| MTEXT formatting beyond the known codes | Low | Strip the known codes; flag any leftover `\` in a stripped string with a dev console warning |
| Thousands of drei `<Text>` instances are slow (PAB-01 has 274 MTEXT) | Med | Hide annotation layers by default; if it's still slow, render texts only for visible layers |
| File System Access permission lost between sessions | Low | `queryPermission`, then `requestPermission` on a user click; show a "Przywróć dostęp" button |

## Open questions
None blocking. The roof plan sits at z 9.12 (ridge) per the spec; revisit if it looks wrong in 3D.
