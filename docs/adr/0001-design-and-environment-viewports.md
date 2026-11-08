# ADR 0001: Separate design and environment viewports

Date: 2026-11-08 · Status: accepted (user)

## Context
Up to M1c there is one 3D viewport, and it draws the DWG sheets, the PDF underlay and the tools. From M3 on, the app
builds 3D volumes (terrain, platforms, walls, house). PLAN.md assumed they would all go into that one viewport.
The user wants the built model kept apart from the drawings, like the separate viewports in a game engine.

## Decision
- Two viewports **side by side**: **Design** (everything that exists today, unchanged: sheets, PDF, layers, align tool)
  and **Environment** (3D volumes only).
- **One camera, one set of controls.** Both halves render the same camera, so position, orientation, zoom and the
  ortho/perspective mode are always identical. Orbiting in either half moves both.
- Implementation: one r3f `Canvas`, rendered twice per frame with a scissor rectangle for each half. Each object
  belongs to design, to environment, or to both, using three.js object layers. Pointer events map to the half under
  the cursor, so design tools still pick correctly.
- M2 assignment: level markers are drawn in **both**. The measure tool "Pomiar" works in **design only**.
  Environment gets the ground grid and the markers. Its real content arrives with M3/M4.

## Consequences
- Every new 3D object has to declare its viewport. Volumes go to Environment, drawing-derived content goes to Design.
- Each half has half the width, so the camera aspect and the ortho frustum must be set per half.
- Rendering twice per frame costs more. Acceptable at the current scene size. Re-check against the 60 fps target in M3.
- Alternatives considered: two separate `Canvas` elements (rejected: textures and fonts would load twice, and the
  cameras would need syncing), and drei `<View>` (rejected: each view has its own camera, so sharing one is extra work).
