# Implementation Plan: M1c (2-point alignment: site plan, PDF)

Spec: PLAN.md §4 (`transform: Similarity2D`), §5 M1c (facts, requirements, ✅). Task checklist: `tasks/todo.md`.
M1b's plan is in git history (merged to `main` as 733cc6f).

## Overview
PZT-01 (kind `site`) is drawn horizontally through a `Similarity2D` sheet → plan transform, derived automatically
from `A-WALL` on first open (expected: rotation −11.275°, scale 1, translation 0). The survey PDF (kind `pdf`) is
rendered to a texture and aligned with a 2-point tool in the top view; the same tool can correct a site sheet.
Utilities and the tank rectangle form an "Przeszkody" layer group in a warning colour.

## Architecture decisions
- **Similarity maths is pure** (`src/project/align.ts`): `apply`, `invert`, `fromTwoPairs(a, a′, b, b′)`, and
  `autoAlign(site, ref)` (rotation candidates from the dominant wall direction mod 90°, translation by 1 mm
  endpoint voting, accept at ≥ 50 % matched reference endpoints within 2 cm). Values (rotation, scale,
  translation, matched share) are shown in the sheet list so the browser check catches errors.
- **Derived-unless-saved, like M1b:** `src/state/site.ts` caches the auto transform per (sheet geometry,
  reference plan), mirrors `state/vertical.ts` (`transformFor(row, derived)`, `unsavedTransforms()` for "Zapisz").
  The reference plan is the same one as M1b (`plan` with z = 0).
- **Drawing:** the horizontal `SheetPlacement` in `coords.ts` gets an optional `transform`; `sheetToWorld` applies
  it before z. Texts add the transform's rotation and scale. One code path for plans, site and PDF.
- **Persistence:** `Sheet.transform` (§4) saved for `site` and `pdf`; `placement: { horizontal, z }` for both
  (defaults site 0, PDF −0.02). Not editable in the UI (YAGNI).
- **PDF:** `pdfjs-dist` (planned stack, Apache-2.0) on the main thread with its own worker (Vite `?url`), page 1
  rendered once to a canvas (~200 dpi, clamped to `gl.capabilities.maxTextureSize`) → `CanvasTexture` on a quad.
  Sheet coords = 1:500 placeholder (PLAN.md M1c).
- **2-point tool:** top view only. Pointer → ray hit on the plane of the target z → world (x, y). Snap = nearest
  segment endpoint within N screen px (radius in m from the ortho zoom). Source points snap to the aligned
  sheet's endpoints (as currently drawn) and are stored in sheet coords via `invert`; target points snap to the
  other visible horizontal sheets. Tool state lives in the store; Esc cancels; the result is applied live and
  marks the project dirty.
- **Obstacles group:** new `GroupId` `obstacles` with the utility layers and `A-DETL-2`, rule placed before
  `details`. Drawn in one warning colour (a per-group colour override in `SheetObject`).

## Task list
See `tasks/todo.md` (T1–T7, checkpoints A and B).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Rotation sign or ±90° flip (plan mirrored/rotated by mistake) | High: silent | Show rotation and matched share; expected −11.275° and 66 % in PLAN.md; top-view wall check |
| PZT-01's legend (x ≈ 95–125 m) inflates fit-view framing | Low | Accept; fit-view button still works. Revisit only if annoying |
| `A-DETL-2` is a generic detail layer, so the obstacles rule also catches it on other sheets | Low | It's a project-wide group by design (M1a T9); check PAB sheets in the browser, narrow the rule if it shows noise |
| pdfjs worker setup under Vite 8, texture too large for the GPU | Med | Small isolated module; clamp to max texture size; show rendered px size in the sheet list |
| Snapping picks the wrong endpoint (dense wall detail) | Med | Show the snapped point; values in the list; T7 checks the tool reproduces the auto values |
