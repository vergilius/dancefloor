# ADR 0007: As-built house lift

Date: 2026-11-08 · Status: accepted (user, 2026-11-08)

## Context
The house was built 0.20 m higher than drawn. The drawings' ±0.00 (355.40 m a.s.l., parsed from the elevations)
is the design floor. The real floor is 355.60. The terrain didn't move: its absolute heights stay.

## Decision
- `house.lift` (m, in `dancefloor.json`, missing = 0, |lift| ≤ 2) is set in the Rysunki panel ("Dom wyżej o").
- **±0.00 = the as-built floor** (user choice): every relative height in the app is relative to the drawings'
  reference + lift, and every shown absolute = that + relative (`useRefValue`). The house and its drawings stay at
  their drawn heights.
- Absolute labels (Ti / Tp / bare spot heights) are read against the as-built ±0.00, so they land `lift` lower.
- The terrain from the elevation and section profiles (drawn against the design ±0.00) is moved down by `lift`.
- Versions keep absolute heights: each version file records the `lift` its frozen `.bin` and edits are relative to.
  In memory they are shifted to the current lift (base, Wyrównaj z, Mur top; Podnieś / Obniż dz unchanged), and
  shifted back on write, so the `.bin` is never rewritten. Changing the lift rebases the loaded versions and their
  undo stacks.

## Consequences
- With lift 0.20, the terrain and the edits read 0.20 lower (e.g. −0.32 → −0.52). A terrace levelled at ±0.00 earlier
  now sits at −0.20 under the floor, on purpose (absolute kept). Re-level it with the floor snap if needed.
- The terrain profile lines drawn on the elevations and sections (and their Ti circles) stay on the sheets, `lift`
  above the terrain mesh: they show the drawn relation, not the built one.
- Tp (designed terrain) is treated as absolute like Ti. If the architect's Tp was meant to follow the house,
  it is now `lift` off.
- Changes the "absolute = 355.40 + relative" rule (CLAUDE.md, PLAN.md §5 M2): absolute = reference + lift + relative.
