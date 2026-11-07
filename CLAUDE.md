# DanceFloor (repo: dancefloor)

Personal, local-only web app: build a 3D project (house + plot) from the architect's DWG sheets, then edit
it. The first editing features are garden levels (platforms, slopes, retaining walls) with exact heights and
cut/fill volumes. DWGs are a read-only source; edits live in our own project JSON. Not a general CAD editor.

**`PLAN.md` is the spec.** It holds the input-file analysis, decisions, data model, milestones M1–M6 with
acceptance criteria, and risks. Read only the section you need for the current task. When a decision
changes, update PLAN.md in the same change.

## Status
- M1a in progress (worker, normalization, stacked plans). Progress lives in `tasks/todo.md`.
- Track milestone/task progress in PLAN.md (or a `tasks/` file created via `planning-and-task-breakdown`).

## Stack (planned, see PLAN.md §3)
Vite + React + TypeScript · three / @react-three/fiber / drei · `@mlightcad/libredwg-web` (in a Web Worker,
wasm in `public/wasm/`) · three-mesh-bvh · delaunator · pdfjs-dist · zustand (+ command stack for undo).
Node 24, **pnpm 12** (pinned via `packageManager`). Don't use npm or yarn.

## Commands
- `pnpm dev`: copies libredwg's WASM to `public/wasm/` (gitignored), then starts the Vite dev server
- `pnpm build`: WASM copy + typecheck + production build
- `pnpm lint`: ESLint
- `pnpm typecheck`: `tsc --noEmit`

TypeScript is pinned to `~6.0` because typescript-eslint 8 doesn't support TS 7 yet.

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
- No backend and no network calls at runtime. Everything runs in the browser.
- Ask before adding a dependency that isn't in the planned stack.
- Out of scope (PLAN.md §7): DWG editing, dimensioning, printing, multi-user, MEP, structural accuracy.

## Workflow: addyosmani/agent-skills (installed in ~/.claude/skills)
- **Start every session and every new task with `using-agent-skills`.** It routes work to the right skill.
  Check for a matching skill before starting work, and follow skill steps in order, including verification.
- Its core behaviors apply: surface assumptions, stop on confusion, push back, keep it simple, stay in
  scope, verify instead of assuming.
- **No automated tests** (user decision, 2026-11-07): no Vitest, no unit or real-file tests. Don't add them, and
  ignore skill steps that require them (TDD, "tests pass"). Verification = `pnpm typecheck`, `pnpm lint`,
  `pnpm build`, plus the user's browser check.
- Definition of Done: typecheck, lint and build green; behavior verified at runtime (in the browser, by the user,
  see below); docs/PLAN.md updated.
- Project-specific notes:
  - Spec = PLAN.md. Use `spec-driven-development` to sharpen a milestone's section, then
    `planning-and-task-breakdown`.
  - No quality bar is written yet. Run `constraint-driven-development` once after scaffolding (→ `CONSTRAINTS.md`).
  - Code where silent bugs are likely (DWG normalization, INSERT transforms, MTEXT/label regexes, grid and
    cut/fill maths): keep it small and pure, and make its results visible in the UI (counts, values) so the
    browser check can catch errors.
  - Use `source-driven-development` for three/r3f/drei/libredwg-web/pdfjs APIs.
  - **The user does browser verification.** Don't drive a browser. At the end of a slice, give a short
    "verify in browser" checklist (what to open, what to click, what you should see) and wait for the result.
  - **Checkpoint routine (so the user can `/clear` between phases):** at every checkpoint in `tasks/todo.md`,
    and before any long session ends: (1) tick the finished boxes; (2) update the `Next:` line at the top of
    `tasks/todo.md` with the next task, plus any non-obvious finding not yet written down (put it in the
    relevant file); (3) commit; (4) tell the user it's safe to clear. To resume: read `tasks/todo.md` and
    continue with the first unchecked task.
  - Deviations from PLAN.md need an ADR (`documentation-and-adrs`, `docs/adr/`).
  - Commits: small and atomic, on a branch, never straight to `main` (`git-workflow-and-versioning`).
