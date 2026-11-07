# DanceFloor — build a 3D project from DWG sheets, then edit it (web)

Personal tool: load a set of the architect's DWG sheets (plans, elevations, sections, site plan) and turn
them into a 3D project of the house and plot. Then edit that project: the first editing features are
garden levels (terraces, slopes, retaining walls) with exact heights and cut/fill volumes. The DWGs stay
read-only; edits live in DanceFloor's own project file. Not a general CAD editor.

## 1. Input analysis (done on the real files, 2026-11-07)

Files: `PAB-01 RZUT PARTERU`, `PAB-02 RZUT PODDASZA`, `PAB-03 RZUT DACHU`.

| Fact | Value | Consequence |
|---|---|---|
| Format | AC1021 (AutoCAD 2007) | Parsed by `@mlightcad/libredwg-web` 0.8.6 without errors, 0.15–1.7 s in Node |
| Units | `INSUNITS=4` → millimetres | Scene in metres, scale 0.001 on import |
| Geometry | 100% 2D, Z/elevation/thickness = 0 on every entity | No 3D to extract; 3D must be generated |
| Coordinates | Local (house ≈ x 0.3–15.1 m, y −12.3–3.0 m), **not** PL-2000 | No float-precision problem for these sheets |
| Sheet alignment | `S-GRID-1` lines identical across sheets | Floors stack directly, no manual registration |
| Origin of export | Revit (AIA layers `A-WALL`, `I-WALL`…, block names `Family - Type-ElementId-View`) | **An IFC export exists in principle — ask the architect** |
| Entities (ground floor) | 1898: LINE 1053, MTEXT 274, INSERT 195, DIMENSION 186, HATCH 70, SPLINE 64… | Walls are loose LINEs, not closed polylines |
| Levels found (MTEXT, layer `G-ANNO-DIMS-1`) | ±0.00, +0.30, −0.02, −0.32, +3.22, +3.29, +3.39, ridge +9.12 | Relative to ±0.00, not absolute (m a.s.l.) |
| Other annotations | roof pitch `38° / 78.13%` (`G-ANNO-DIMS`), paving slopes `1.5%`, `0.5%` (`PZT_OPIS`), level markers as INSERT `Rzędne punktów…` (no attributes exposed) | Level text must be read from MTEXT near the marker |
| Site elements | `PZT_UTWARDZENIA` (paved areas, LINEs), `Bryła terenu` (4 lines) | Paving outlines usable as underlay; **no terrain heights in these files** |

Relevant layers for the app:
- Exterior walls: `A-WALL`, `A-WALL-1`; interior: `I-WALL`, `I-WALL-1`
- Roof: `A-ROOF-OTLN`, `A-ROOF` (PAB-03)
- Site: `PZT_UTWARDZENIA`, `Bryła terenu`, `PZT_OPIS`
- Levels: `G-ANNO-DIMS-1` (MTEXT), `G-ANNO-DIMS` (markers + roof pitch)
- Noise to hide by default: `G-ANNO-*` (title block, schedules, notes), `PZT_WYMIARY-1` (dimensions), `I-FURN*`, `P-SANR-FIXT`, `*-PATT*` hatches
- Doors: `A-DOOR` holds leaves, frames **and** the swing arcs (all ARCs on `A-DOOR` in PAB-01/02 are 90°, r 750–911 mm,
  inside the door blocks). Swings aren't real geometry (user, T9): the worker moves them to our own layer `A-DOOR (łuki)`.
  Windows: `A-GLAZ*`. Tags/labels: `*-IDEN*`; hidden/overhead lines: `*-HDLN*`.
- Layer groups (T9, `src/project/layerGroups.ts`, first match wins): **Levels** `G-ANNO-DIMS*` · **Grid** `S-GRID*` ·
  **Details** `*-IDEN*` `*-ANNO*` `*-PATT*` `*-HDLN*` door swings · **Layout** `A-WALL*` `I-WALL*` `A-DOOR*` `A-GLAZ*`
  `S-COLS*` `S-STRS*` `A-FLOR-HRAL*` `A-ROOF*` · **Details** `G-ANNO-*` `I-FURN*` `P-SANR-*` `Q-SPCQ*` `A-DETL-*` `A-AREA*`
  `PZT_WYMIARY*` `PZT_OPIS*` · **Other** everything else (e.g. `G-IMPT`, `Obieg pionowy`, site layers). Details start hidden.

### Second batch: PZT-01 (site plan), PAB-04..06 (sections A-A, B-B, C-C), PAB-07..10 (elevations N/E/W/S)

All AC1021, mm, pure 2D, parse in 0.1–0.5 s each.

| Fact | Source | Consequence |
|---|---|---|
| **±0.00 = +355.40 m a.s.l.** | elevations, MTEXT `0,00= +355.40 m npm` | Absolute reference solved — no manual input needed |
| Designed terrain spot heights `Tp= 355,08` etc. (7 labels, 353.48–355.20) | PZT-01, layer `G-ANNO-TEXT-4` (MTEXT + circle/hatch symbol) | Parse value + insertion point → designed-terrain points in plan coords |
| Existing/designed terrain at façade corners `Ti=…`, `Tp=…`, `Tp=Ti=…` (352.65–355.70 m) | elevations, `G-ANNO-DIMS` | ~3 m fall across the house footprint — **sloped plot, garden levels matter** |
| Existing terrain profile lines | `PZT_TEREN ISTNIEJĄCY` (LINEs) in every elevation (8–12) and PZT-01 (60) | In elevations: vertical profile along each façade (x = along façade, y = height). In PZT: outline only, no heights |
| Elevation ↔ plan mapping | `S-GRID-1` (14 lines) present in elevations | Grid lines give exact x-calibration of each elevation onto its façade |
| Floor/roof heights | sections: +3.02/+3.22/+3.29 (attic floor), +2.64/+3.59 (eaves zone), +4.50/+4.75, +6.04/+6.24, ridge +9.12, foundations −1.40/−1.70/−2.00, roof 38° | Enough to build a decent massing without IFC |
| Site elements | PZT-01: `PZT_UTWARDZENIA` (paving), `PZT_OGRODZENIE` (fence), `PZT_ZAKRES` (investment area), utilities `PZT_GAZ*`, `PZT_WODA P`, `PZT_KAN*`, `PZT_PRĄD` | Underlay + "don't dig here" overlay for utilities |
| ⚠ PZT-01 registration | `A-WALL` bbox in PZT (x 1.69–17.16, y −10.74–4.56 m) ≠ floor plans (x 0.34–15.12, y −12.27–3.05 m); no `S-GRID` in PZT | Likely translated (maybe rotated) — **needs 2-point alignment** to the ground-floor plan |

File names in `dwg/`: the site plan is `PROJEKT ZAGOSPODAROWANIA TERENU.dwg` ("PZT-01" in this document).
Total: 12 DWG + 1 PDF.

### Third batch: PAB-11 (path & driveway), PAB-12 (rainwater tank) — analysed 2026-11-07
Both are **construction details** in their own local coordinates (no `S-GRID`, no `A-WALL`). They are not
placed in 3D. They supply parameters only.

| Fact | Source | Consequence |
|---|---|---|
| Paving build-up **T1** (path + driveway): concrete pavers 8 cm, sand bed 3 cm, base 0/31.5 20 cm, sub-base 31.5/63 20 cm → **51 cm**. Cross-fall 1.5 %, drive-over kerb on a concrete footing | PAB-11, `G-ANNO-TEXT`, `PZT_OPIS`, `PZT_TEREN PROJEKTOWANY` | Paving platforms (M4) have an excavation depth below the finished surface (default T1 = 0.51 m) and a default cross-fall of 1.5 % |
| Sealed rainwater tank, concrete C35/45, **10 m³**, dimensions 2.4 × 3.0 m, 1.7 (height), on ≥ 20 cm sand bed, ≥ 50 cm above groundwater; emptied by truck from the fence line | PAB-12, `G-ANNO-TEXT`, `PZT_WYMIARY-1` (DIMENSION values) | "Don't dig here" obstacle with depth. **Location not in PAB-12**: take it from PZT-01 (label "PROJEKTOWANY ZBIORNIK SZCZELNY…" exists there, symbol still to be identified in M1c). Truck access to the fence line is a garden constraint |

### Grid labels (for automatic elevation placement)
- Grid bubbles are `INSERT` blocks `Siatka - AA_Grot siatki - Okrąg-…-<VIEW>` on `S-GRID-IDEN`, each with
  an MTEXT label on the same layer (`\fArial…;\W.8;A`).
- Ground plan: 14 labels × 2 bubbles each: `1`–`7` and `A`–`G`.
- Each elevation or section shows one family: e.g. PAB-04 (A-A) and PAB-08 (E) show `A`–`G`; PAB-07 (N)
  shows `1`–`7`. That is enough to match labels on the sheet to the plan's grid lines.
- The suffix of the block name names the view (`-POZIOM 0`, `-WSCH`, …), which is a possible hint for
  which façade a sheet is.

### Survey map (mapa do celów projektowych) — PDF only
- 1 page A2, vector, 4 MB. Survey map with the PZT drawn over it.
- **All map text is converted to outlines**: `pdftotext` returns only the title block, so there are
  zero extractable spot heights. OCR is not worth it (small rotated labels, decimal dot is a separate glyph).
- Spot heights are clearly readable when rendered (e.g. 353.19, 354.26, 352.75, 350.99, 348.67),
  roughly every 3–10 m, so a few dozen points over a 500 m² plot.

### Still missing
1. **Survey map as DWG/DXF from the surveyor** (the firm in the map's title block). Surveyors draw these
   in CAD; the source file has heights as text or points with Z. Expect PL-2000 coordinates
   (probably zone 7, EPSG:2178) → apply the local-origin shift from §6. Best ask.
2. **IFC export of the Revit model** → full 3D house for free (M5 becomes trivial).

## 2. Decisions

- **Web app**, local-only (no backend). Performance is a non-issue at this scale (<5k entities/sheet).
- **DWG is a read-only underlay.** Never write DWG. Own JSON scene model for everything designed.
- **Terrain = regular height grid** (default 10 cm cells), not a TIN. Platforms/slopes write into the
  grid; cut/fill = Σ(Δh × cell area). Avoids constrained triangulation and mesh booleans.
- **GPL isolation:** run libredwg-web in a dedicated Web Worker (GPL-3.0); rest of app any license.
  Irrelevant for private use, cheap to keep clean.
- **File access:** the user picks the project folder (the one holding the DWGs/PDF) with the File System
  Access API directory picker. The directory handle is persisted in IndexedDB, so reopening needs only
  one permission click. The project JSON lives in that folder and references sheets **by filename**.
  Chromium-only is accepted (personal tool).
- **UI language: Polish.** Code, identifiers, comments and docs stay in English.
- **Elevation/section placement:** automatic by matching `S-GRID-IDEN` labels between the sheet and the
  ground plan. When that fails the sheet is flagged with a reason; a manual fallback (pick 2 grid lines on
  the sheet and the matching 2 on the plan) is deferred until a real sheet needs it (M1b, 2026-11-07).

## 3. Stack

| Concern | Choice |
|---|---|
| Build/UI | Vite + React + TypeScript |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` (CameraControls, Grid, TransformControls, Html) |
| DWG | `@mlightcad/libredwg-web` in a worker (WASM bundled by Vite from the glue's `new URL(…, import.meta.url)`) |
| Sheet texts | drei `<Text>` with local `@fontsource/noto-sans` (latin + latin-ext woff); `troika-three-text` direct dep only for `configureTextBuilder` (default font). Glyphs missing from both fall back to troika's CDN (user decision, M1a T8) |
| Picking/snapping | `three-mesh-bvh` |
| Terrain seed | `delaunator`, only to rasterize survey points into the grid |
| PDF underlay | `pdfjs-dist` (survey map until a DWG version exists) |
| State | `zustand` (+ simple command stack for undo/redo) |
| Persistence | File System Access API (directory handle, project JSON next to the DWGs); IndexedDB stores the handle only |
| Later/optional | `web-ifc` (IFC house), `manifold-3d` (only if real booleans are ever needed) |

No CAD framework (cad-viewer/realdwg-web) — too broad for this scope; can be used as a reference
for DWG entity rendering (MTEXT, HATCH, SPLINE).

## 4. Data model (sketch)

```ts
type Project = {
  units: 'm';
  sheets: Sheet[];                 // imported DWGs
  terrain: { cell: number; origin: Vec2; cols: number; rows: number; base: Float32Array /* existing */ };
  features: Feature[];             // ordered; applied on top of terrain.base
  house?: { source: 'massing' | 'ifc'; ... };
};
// A sheet has three independent aspects: what kind of drawing it is, how it is placed in 3D,
// and how its own 2D coordinates map onto the reference (ground-floor plan) coordinates.
// Storey (ground/attic/roof) is NOT a kind — those are all `plan` sheets at different z.
type Sheet = { id; file: string;
  kind: 'plan' | 'elevation' | 'section' | 'site' | 'pdf'    // pdf = survey map underlay
      | 'detail';           // PAB-11/12: parameters only, not drawn in 3D (placement/transform unused)
  placement:
    | { type: 'horizontal'; z: number }                 // m rel. ±0.00; e.g. ground 0, attic 3.29, roof 9.12
    | { type: 'vertical'; origin: Vec2; dir: Vec2 };    // M1b: sheet point (x, y) → plan point origin + x·dir
                                                        //  (dir = unit vector, may point "backwards" = mirror),
                                                        //  height y rel. ±0.00. Viewer looks along (−dir.y, dir.x).
  transform: Similarity2D;  // sheet coords → reference plan coords (metres)
                            //  plan: identity (S-GRID-1 coincides)
                            //  site, pdf: from 2-point alignment
                            //  elevation, section: unused (M1b: scale 1 and the axis mapping live in `placement`)
  layers: Record<string, { visible: boolean; color?: string }> };  // T9: only layers turned off are stored
// Project-level: groups: Record<'layout'|'levels'|'grid'|'details'|'other', boolean>  (T9; applies to all sheets)
type Similarity2D = { scale: number; rotation: number /* rad */; translate: Vec2 };
type Feature =
  | { kind: 'platform'; polygon: Vec2[]; z: number; material: 'grass'|'paving'|'gravel' }
  | { kind: 'slope'; from: FeatureId | Edge; ratio: number /* 1:n */ }
  | { kind: 'wall'; polyline: Vec2[]; top: number; thickness: number };
```

Designed surface = evaluate features in order over the grid. Never mutate `terrain.base`.

Saved as `dancefloor.json` in the project folder, `version: 1` (M1a T7, `src/project/projectFile.ts`). The
filename is the sheet's key, so there is no separate `id`. Fields are added as tasks need them (T7: `file`,
`kind`, horizontal `placement` for plans). Saved sheets whose file has gone stay in the JSON and are flagged in the list.

## 5. Milestones (each with acceptance criteria)

**M1 — DWG underlay viewer** (three sub-milestones, each shippable on its own).
Sheets are positioned by `kind`, `placement` and `transform` as defined in §4 (single source of truth,
don't redefine here).

**M1a — Worker, normalization, stacked plans** — done 2026-11-07 (slowest parse 1015 ms, PAB-02)
- Open the project folder (§2 File access); list the DWGs in it. Auto-suggest `kind` from the filename
  (`RZUT` → plan, `ELEWACJA` → elevation, `PRZEKRÓJ` → section, `ZAGOSPODAROWANIA` → site, otherwise
  detail) and default `z` for plans (`PARTERU` 0, `PODDASZA` 3.29, `DACHU` 9.12). The user confirms or
  fixes these once in the sheet list, and the result is saved in the project JSON.
- Worker parses DWG → normalized geometry in metres (LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE, SPLINE→polyline,
  INSERT expanded with transforms, MTEXT as text sprites; skip HATCH/DIMENSION at first).
- Layer panel with per-layer toggle plus project-wide layer groups (§1); the Details group (noise layers) is hidden by default.
- Plan sheets (PAB-01/02/03) drawn horizontally at their `z` with identity `transform`.
- ✅ Each of the 12 DWGs parses in the worker in < 2 s; PAB-01/02/03 stack with `S-GRID-1` lines
  coinciding (< 1 mm); layer toggles work; reopening the app restores the folder after one permission click.

**M1b — Elevations and sections on their lines** (spec sharpened 2026-11-07 on the real files)

Facts (analysed on PAB-01, PAB-04..10 after normalize):
- Every vertical sheet has `S-GRID-1` as 14 vertical stubs (2 per grid line) and 7 `S-GRID-IDEN` labels of one
  family. Sheet x of each grid line is **exactly** the plan coordinate, up to sign/axis (Revit shared coordinates):

  | Sheet | Labels | Sheet x = | `dir` | Looks | Plane (perpendicular position) |
  |---|---|---|---|---|---|
  | PAB-04 A-A | A–G | −plan y | (0, −1) | east | x = 6.712 (cut line) |
  | PAB-05 B-B | 1–7 | plan x | (1, 0) | north | y = −6.363 (longest part of a jogged cut, other part y = −5.626) |
  | PAB-06 C-C | 1–7 | −plan x | (−1, 0) | south | y = −0.063 (cut line) |
  | PAB-07 N | 1–7 | −plan x | (−1, 0) | south | y = 3.051 (max `A-WALL` y) |
  | PAB-08 E | A–G | plan y | (0, 1) | west | x = 15.124 (max `A-WALL` x) |
  | PAB-09 W | A–G | −plan y | (0, −1) | east | x = 0.034 (min `A-WALL` x) |
  | PAB-10 S | 1–7 | plan x | (1, 0) | north | y = −14.966 (min `A-WALL` y: the terrace and the SW cornice out to the terrace columns, user) |
- Sheet y is already the height in metres rel. ±0.00 (level labels sit at value + 0.42 on every sheet; grid
  stubs end at y = −0.775 on all 7). So there is no y offset and no scale to solve.
- Section cut lines on PAB-01: `G-ANNO-SYMB-2` LINEs (5 segments: A-A one line, B-B a 3-segment jog, C-C one
  line); their letters are MTEXT `A`/`B`/`C` on `G-ANNO-SYMB` next to the line start. Elevations have no line
  in the plan (only arrows `Elewacja - Strzałka…` on `G-ANNO-SYMB`).

Requirements:
- **Axis mapping from grid labels:** for each vertical sheet, take each `S-GRID-IDEN` label's nearest sheet
  `S-GRID-1` grid line, match the label to the same label on the reference plan (PAB-01: digits = vertical plan
  lines → plan x, letters = horizontal → plan y), and fit sheet x = s·p + t with s = ±1 (least squares,
  both signs tried). Result: `dir` (axis + sign), the along-line offset `t`, matched label count, max residual.
- **Perpendicular position:** sections: the cut-line segment(s) on `G-ANNO-SYMB-2` nearest the section's letter
  (letter taken from the filename `PRZEKRÓJ X-X`); for a jog, the longest segment parallel to `dir`. Elevations:
  the ground plan's outermost `A-WALL` extent on the viewer's side. The value is shown and editable (number, m)
  in the sheet list, with a Reset back to the derived value.
- **Flag, don't guess:** < 2 matched labels, |s| fit residual > 5 mm, or no cut line for a section → the sheet is
  not drawn and the sheet list shows the reason. No manual 2-line picking tool in M1b (all 7 sheets resolve
  automatically; build it only when a real sheet needs it).
- Draw vertical sheets like plans (same layer panel/groups), standing on their plane; texts face the viewer
  side (−look direction). The derived placement is saved in `dancefloor.json` with "Zapisz" (like plan z), and
  re-derived only when the sheet has no saved placement.
- Sheet list shows per vertical sheet: matched labels (e.g. `7/7`), max residual in mm, look direction, plane position.

✅ PAB-04..10 placed automatically (or flagged with a reason); each shows 7/7 labels and residual < 1 mm;
in the 3D view the grid stubs of each vertical sheet stand on the plan's grid lines (< 1 cm, top view);
the ±0.00 line of each elevation lies at z = 0 (on PAB-01); placement survives save + reload.

**M1c — 2-point alignment (site plan, PDF)**
- Tool: pick 2 points on the sheet → 2 points on the reference plan → `Similarity2D` (show the
  resulting scale; for DWG→DWG it should be 1.000).
- Apply to PZT-01 and the survey PDF (rendered to a texture via `pdfjs-dist`). Persist in the project JSON.
- Identify the rainwater tank (PAB-12) outline in PZT-01, and show it with utilities as an obstacle.
- ✅ PZT-01 `A-WALL` lines lie on the ground-plan walls within 2 cm; PDF house outline visibly matches;
  alignment survives reload.

PAB-11 and PAB-12 are detail sheets: no placement, used only for the parameters recorded in §1.

**M2 — Levels & references**
- Extract labels (strip MTEXT formatting first):
  - relative levels `^[+\-±]\d+[.,]\d{2}$` (`G-ANNO-DIMS-1`)
  - absolute reference `0,00=\s*\+?(\d+[.,]\d+)\s*m\s*npm` → 355.40
  - terrain `(Tp|Ti)(=Ti|=Tp)?=\s*\+?(\d{3}[.,]\d{2})` (PZT `G-ANNO-TEXT-4`, elevations `G-ANNO-DIMS`)
  - decimal comma and dot both occur.
- Show both relative and absolute heights everywhere (abs = 355.40 + rel).
- Measure tool (distance, height difference).
- ✅ Reference auto-detected as 355.40; all Tp/Ti labels listed with positions; a known dimension measures correctly.

**M3 — Terrain grid**
- Seed points: PZT `Tp` points (plan coords) + elevation profiles `PZT_TEREN ISTNIEJĄCY`
  projected onto their façade lines (3D polylines) + `Ti` corner values.
- Existing terrain = delaunator over existing-terrain points → rasterize; outside the hull,
  extrapolate with nearest/plane fit and render it visibly as "uncertain" (hatched/transparent).
- Keep existing (`Ti`) and architect-designed (`Tp`) as two separate surfaces; user designs on top.
- **Survey points, fallback until DWG arrives:** PDF underlay (`pdfjs-dist`, render the page to a
  texture at high DPI), align it to PZT-01 with the 2-point tool (scale from the drawing), then a
  "spot height" tool: click the dot, type the value. Roughly 15–20 min of clicking for the whole plot.
- When the survey DWG arrives: import its points instead; keep the manual points for comparison.
- ✅ Terrain around the house matches all Ti values within 2 cm; contour lines every 0.25 m; 60 fps.

**M4 — Garden tools (core value)**
- Platform: draw polygon snapped to underlay vertices/edges, set Z numerically. Paving platforms have a
  build-up depth (default T1 = 0.51 m, PAB-11) for excavation volume, and a cross-fall (default 1.5 %).
- Obstacles: utilities and the rainwater tank (PAB-12, 10 m³, depth ~1.7 m + 0.2 m bed) warn when a cut
  reaches them. Keep truck access from the fence line to the tank.
- Slope: from platform edge down/up to terrain with ratio 1:n; retaining wall alternative.
- Undo/redo, edit vertices, delete.
- Cut/fill readout (m³) per feature and total; height-difference colour map (designed − existing).
- ✅ Terrace at +0.30 next to the house with a 1:2 slope to −0.32; volumes update live.

**M5 — House massing**
- Semi-auto: select closed loop from `A-WALL` lines (loose LINEs → join endpoints within 1 mm
  tolerance → polygons) → extrude to heights from sections (ground floor to +3.02/+3.29, eaves
  ~+3.59, ridge +9.12); roof from `A-ROOF-OTLN` (PAB-03) + 38° pitch, or manual.
- Sections/elevations as vertical underlays help verify the massing visually.
- Alternative path if IFC arrives: load via `web-ifc`, align with grid.
- ✅ Recognisable massing aligned with the ground-floor plan; terrace touches the façade.

**M6 — Output**
- Save/load project JSON; screenshot; glTF export (`GLTFExporter`).
- Optional: export designed contours as DXF for the architect (simple R12 writer).

## 6. Risks / notes for implementation
- MTEXT contains inline formatting (`\fArial|b0|i0|c238|p34|;\W.8;…`, `\P`) — strip before display/regex.
- Level markers are INSERTs without readable attributes; the value is a separate MTEXT nearby —
  associate by proximity if needed.
- Walls are segmented LINEs with gaps at openings; loop detection (M5) needs tolerance + manual fallback.
- Default libredwg-web build has DXF read disabled — if the site map arrives as DXF, use a small DXF
  parser or convert to DWG; don't rebuild the WASM. (Verified in practice; the 0.8.6 README claims
  DXF read works in the default build, which is not true for the published WASM.)
- Utilities (`PZT_GAZ*`, `PZT_WODA P`, `PZT_KAN*`, `PZT_PRĄD`): show as an overlay and warn when a
  cut feature crosses them.
- Title block contains personal data — never commit sample DWGs to a public repo.
- Scale: 1 drawing unit = 1 mm; keep scene in metres.

## 7. Out of scope
Editing/saving DWG, dimensioning, printing sheets, multi-user, MEP, structural accuracy.
For now: handling revised DWGs (same filename, changed content). Saved settings are simply reused.
