# Garden Levels (repo: dancefloor)

Personal, local-only web app: load the architect's DWG sheets as a read-only underlay, show house + plot
in 3D, and design garden levels (platforms, slopes, retaining walls) with exact heights and cut/fill volumes.
Not a CAD editor.

**`PLAN.md` is the spec.** It holds the input-file analysis, decisions, data model, milestones M1–M6 with
acceptance criteria, and risks. Read only the section you need for the current task. When a decision
changes, update PLAN.md in the same change.

## Status
- Pre-scaffold: no app code yet. Next step is **M1 (DWG underlay viewer)**.
- Track milestone/task progress in PLAN.md (or a `tasks/` file created via `planning-and-task-breakdown`).

## Stack (planned, see PLAN.md §3)
Vite + React + TypeScript · three / @react-three/fiber / drei · `@mlightcad/libredwg-web` (in a Web Worker,
wasm in `public/wasm/`) · three-mesh-bvh · delaunator · pdfjs-dist · zustand (+ command stack for undo).
Node 24, **pnpm 12** (pinned via `packageManager`). Don't use npm or yarn.

## Commands
None yet. When scaffolding, add `dev`, `build`, `test` (Vitest), `lint`, `typecheck` scripts and list them here.

## Domain rules (easy to get wrong)
- DWG units are **mm** (`INSUNITS=4`). The scene is in **metres**, so scale by 0.001 on import.
- Heights: relative to ±0.00; **absolute = 355.40 m a.s.l. + relative**. Show both. The 355.40 is parsed
  from the drawings, never hard-coded as the only source.
- Terrain is a **regular height grid** (default 0.10 m cells), not a TIN. Features are applied in order over
  `terrain.base`. **Never mutate `terrain.base`.** Cut/fill = Σ(Δh × cell area).
- Keep existing terrain (`Ti`) and architect-designed terrain (`Tp`) as separate surfaces.
- DWG is **read-only**. Never write DWG. Our own project JSON is the source of truth for designed features.
- libredwg-web is GPL-3.0. Keep it isolated in its worker and import it nowhere else.
- MTEXT has inline formatting (`\f…;`, `\W…;`, `\P`), so strip it before display or regex. Decimal comma
  and dot both occur.
- Floor plans share `S-GRID-1` and stack directly. PZT-01 (site plan) is **not** registered and needs
  2-point alignment.
- Libredwg's DXF read is disabled. Don't rebuild the WASM.

## Boundaries
- **Never commit anything from `dwg/`** (DWG/PDF title blocks contain personal data). It is gitignored.
  Tests must use small synthetic fixtures, or read real files from `dwg/` locally and skip when absent.
- No backend and no network calls at runtime. Everything runs in the browser.
- Ask before adding a dependency that isn't in the planned stack.
- Out of scope (PLAN.md §7): DWG editing, dimensioning, printing, multi-user, MEP, structural accuracy.

## Workflow: addyosmani/agent-skills (installed in ~/.claude/skills)
- **Start every session and every new task with `using-agent-skills`.** It routes work to the right skill.
  Check for a matching skill before starting work, and follow skill steps in order, including verification.
- Its core behaviors apply: surface assumptions, stop on confusion, push back, keep it simple, stay in
  scope, verify instead of assuming.
- Definition of Done: tests pass, no regressions, behavior verified at runtime (in the browser), docs/PLAN.md updated.
- Project-specific notes:
  - Spec = PLAN.md. Use `spec-driven-development` to sharpen a milestone's section, then
    `planning-and-task-breakdown`.
  - No quality bar is written yet. Run `constraint-driven-development` once after scaffolding (→ `CONSTRAINTS.md`).
  - Test-first targets: DWG normalization, MTEXT stripping, label regexes, grid evaluation, cut/fill volumes.
  - Use `source-driven-development` for three/r3f/drei/libredwg-web/pdfjs APIs, and
    `browser-testing-with-devtools` to check the 3D view.
  - Deviations from PLAN.md need an ADR (`documentation-and-adrs`, `docs/adr/`).
  - Commits: small and atomic, on a branch, never straight to `main` (`git-workflow-and-versioning`).
