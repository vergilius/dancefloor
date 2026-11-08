# Constraints

Last reviewed: 2026-11-07 by Mike Paw

Run everything with `pnpm check` (blocks on any failure; run at the end of every task, before handing back).
This file is the source of truth. `scripts/bundle-budget.mjs` reads its budgets from the table below, and
`scripts/floor-guard.mjs` flags any edit here that loosens a rule. Don't weaken this file to make a change pass.

## Floor (always enforced, checked by `node scripts/floor-guard.mjs` against `main`)

- No new suppression comments: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`
- No unfinished work: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` standing in for code
- No personal data: nothing under `dwg/`, and no `.dwg`/`.dxf` file is ever tracked by git
- No runtime network calls in `src/`: no `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
  or `http(s)://` imports. The WASM is a Vite-bundled asset loaded by the libredwg glue, not via our own fetch.
- No automated tests are added (user decision, CLAUDE.md), so there are no test-skip rules
- This file doesn't get weakened in the same change as the code that was failing

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|-----------|---------|
| Types | Zero type errors (strict) | `tsc --noEmit` (inside `pnpm build`) | task end |
| Lint | Zero ESLint errors, incl. the libredwg import boundary | `pnpm lint` | task end |
| Build | Production build succeeds | `pnpm build` | task end |
| Dependencies | Nothing at high or above | `pnpm audit --audit-level high` | task end |
| Bundle size | Each entry under its budget below | `node scripts/bundle-budget.mjs` (after build) | task end |

`pnpm audit` is the one external opinion (the npm advisory database). It needs network at dev time, and if
it can't reach the registry it fails, which is correct: an unrun scan doesn't count as a pass.

### Bundle budgets (raw bytes of `dist/assets`, 1 kB = 1000 B)

| Entry | Budget | Today (2026-11-07) | Why this number |
|-------|--------|-------|-----------------|
| Bundle `index-*.js` | ≤ 1600 kB | 1500 kB (2026-11-08) | three + r3f + drei dominate. Was 1500 kB (2026-11-07, 1196 kB then); raised by the user 2026-11-08 when M4b (walls, edit interaction) reached it: ~100 kB headroom for M4c–M6 |
| Bundle `dwg.worker-*.js` | ≤ 300 kB | 196 kB | libredwg glue plus normalization (T4–T6). Pure code should stay small |

The libredwg `.wasm` (11.4 MB, two copies, see `tasks/todo.md`) is a pinned vendor file and isn't budgeted.
Raising a budget is allowed but loud: do it in its own commit, with the reason in the "Why" column.

## Measured, not yet enforced

| Metric | Today | Direction |
|--------|-------|-----------|
| `pnpm check` wall time | ~5 s (build 1.7 s, lint 1.1 s, audit ~1–2 s) | must stay under 90 s |
| DWG parse time per file | shown in the UI (T3) | under 2 s each (PLAN.md M1a, user's browser check) |

## Known gaps (accepted, not fixed)

- `pnpm audit` exits 0 when the registry is unreachable. It only counts as a pass if it printed a result.
- The floor guard only catches a loosened threshold here once this file is on `main`. Until then it's a new
  file in the diff, with no old version to compare against.

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
