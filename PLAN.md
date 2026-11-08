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
| ⚠ PZT-01 registration | `A-WALL` bbox in PZT (x 1.69–17.16, y −10.74–4.56 m) ≠ floor plans (x 0.34–15.12, y −12.27–3.05 m); no `S-GRID` in PZT | **Rotated −11.275° about the origin, no shift, scale 1** (checked 2026-11-08, see M1c). Aligned automatically from `A-WALL` (2-point tool as fallback) |

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
- **Generated model, edited as a copy (ADR 0002):** DWG-derived 3D (terrain, massing) is generated on load and never
  saved; the environment editor works on a copy, and only that copy is saved.
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

**M1b — Elevations and sections on their lines** — done 2026-11-07 (spec sharpened 2026-11-07 on the real files)

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

**M1c — 2-point alignment (site plan, PDF)** — done 2026-11-08 (spec sharpened 2026-11-08 on the real files, approved 2026-11-08)

Facts (PZT-01 and PAB-01 after normalize):
- **PZT-01 is the ground plan rotated, not shifted:** sheet → plan = rotation by **−11.27506°** about the
  origin, translation (0, 0), scale 1. The rotated `A-WALL` bbox equals PAB-01's to the mm (x 0.034–15.124,
  y −14.966–3.051), and the best translation vote is 0,0 mm. (So the §1 row saying "translated" was wrong.)
  PZT-01 also has ~2× the `A-WALL` length (extra wall detail inside the footprint). That is expected and
  doesn't affect alignment.
- PZT-01 includes a legend at sheet x ≈ 95–125 m. Its utility line samples are drawn there too.
- **Rainwater tank:** legend symbol `ZB` (`G-ANNO-TEXT-3`). On the plot: `ZB` at sheet (11.74, −12.06), next to an
  `A-DETL-2` rectangle, which in plan coords is axis-aligned at x 8.785–11.785, y −15.838…−13.438
  (3.00 × 2.40 m, as in PAB-12). It sits off the south façade, partly beyond the S plane (y −14.966).
- Survey PDF: 1 page, A2 portrait (1191 × 1684 pt), `/Rotate 0`. Its scale is unknown until it's aligned.
- No sheet of kind `site`/`pdf` is drawn yet, and the scene has no click picking yet.

Requirements:
- **Draw site and PDF sheets horizontally** through their `transform` (sheet → plan) at a `z`: site default 0,
  PDF default −0.02 (just under the lines). Same layer panel and groups as plans. The PDF page is rendered once
  to a texture with `pdfjs-dist` (target ~200 dpi, clamped to the GPU max texture size) on a quad.
  Untransformed default = identity. PDF sheet coords assume a 1:500 map (1 pt = 25.4/72 mm paper × 500, page
  origin bottom-left), a placeholder until aligned; the scale shown after alignment is then ≈ 1.000 if the map
  really is 1:500.
- **Automatic initial alignment for site sheets** (user, 2026-11-08), derived only when the sheet has no saved
  `transform` (like the vertical placement). Pure function over the site sheet's and the reference plan's
  (plan with z = 0) `A-WALL` segments, scale fixed at 1 (both DWG, mm):
  1. rotation candidate θ = length-weighted dominant wall direction of each sheet (angle × 4 averaging, segments
     ≥ 0.5 m), difference taken mod 90°; try θ + k·90°, k = 0..3;
  2. per candidate, translation = most-voted endpoint difference (reference − rotated site, rounded to 1 mm);
  3. keep the candidate whose share of reference endpoints with a site endpoint within 2 cm is highest.
  Accept if that share is ≥ 50 % (PZT-01: 66 %, the rest is extra detail in PZT-01). Otherwise flag the sheet
  with the reason and leave it at identity, so the 2-point tool is the fallback. The sheet list shows the share.
- **2-point tool (top view):** start "Wyrównaj" on a site/PDF sheet → click A on the reference, then A′ (the same
  point) on the sheet; the sheet shifts at once so A′ lies on A (rotation and scale kept). Then B on the reference
  and B′ on the sheet → `Similarity2D` (scale, rotation, translation) from the two point pairs, applied
  live (user, 2026-11-08: reference first, shift after the first pair). Used for the PDF, and to correct a site sheet by hand. Source clicks snap to the sheet's segment endpoints (DWG) or are free (PDF). Target clicks snap to
  endpoints of the visible, already-placed horizontal sheets (plans and an aligned site plan). Snap radius in
  screen px; the snapped point is shown. Esc cancels and restores the transform from before the tool started.
- Sheet list shows per aligned sheet: scale (3 decimals), rotation (°, 3 decimals), translation (m), with a
  Reset (site sheet: back to the automatic alignment; PDF: back to identity). For PZT-01 the expected values are scale 1.000, rotation −11.275°, translation ≈ 0.
- `transform` saved in `dancefloor.json` with "Zapisz", validated on load (like the vertical placement).
- **Obstacles overlay:** a project-wide layer group "Przeszkody" holding the utility layers (`PZT_GAZ*`,
  `PZT_WODA P`, `PZT_KAN*`, `PZT_PRĄD`) and the tank rectangle `A-DETL-2`, drawn in one warning colour. No
  depth/3D box in M1c (obstacles with depth are M4).

✅ PZT-01 aligned automatically on first open shows scale 1.000 and rotation −11.275° (±0.01°); its `A-WALL` lines lie on
PAB-01's walls within 2 cm (top view); the tank rectangle shows at plan x 8.8–11.8, y −15.8…−13.4 in the
obstacle colour; the PDF's house outline visibly matches PZT-01; both alignments survive save + reload; the 2-point tool on PZT-01 (two wall
corners) reproduces the same values within 0.01° / 1 cm.

PAB-11 and PAB-12 are detail sheets: no placement, used only for the parameters recorded in §1.

**M2 — Levels & references** — done 2026-11-08 (spec sharpened 2026-11-08 on the real files, approved 2026-11-08: keep it
minimal, the labels won't be used much)

Facts (raw entities and normalized texts of all 12 DWGs, model space only):
- **Reference:** MTEXT `0,00= +355.40 m npm` on `G-ANNO-DIMS` in PAB-07, 08, 09, 10 (4 of 4 elevations, all
  355.40). Nowhere else.
- Relative levels (`+0.00`, `-0.32`, `+9.12`, 90 in all, on `G-ANNO-DIMS-1` and `G-ANNO-DIMS`) are readable
  on the drawn sheets already. M2 doesn't extract them (user, 2026-11-08: labels won't be used much).
- **Absolute labels** (3-digit metres, all on `G-ANNO-DIMS` in elevations, `G-ANNO-TEXT-4` in PZT-01) come in
  four forms: `Tp= 355,08` (PZT-01, comma), `Tp= +355.08`, `Ti= +354.54`, `Tp=Ti= +352.65 m npm`, and **bare**
  `+355.08` with no Tp/Ti prefix. Counts: PZT-01 7 Tp; elevations 16 prefixed (PAB-07 0, 08 5, 09 4, 10 7) + 8 bare
  (PAB-07 2, 08 3, 09 3).
- **The measured point is not the text.** Each absolute label has a leader to a small CIRCLE whose centre is
  the point:
  - PZT-01: the text sits in a rectangle LWPOLYLINE; an ARC (r 6–75 m) runs from that rectangle's edge to the
    circle centre (r 0.1 m). Both ends match to < 1 mm, and all 7 resolve. The points are 2–20 m from the
    text, so "nearest circle" picks the wrong one.
  - Elevations: circle r 0.03 m; leaders share knees (a Tp and a Ti at one façade corner), so following lines
    is ambiguous. But the circle's sheet y is the height: **|y − (value − 355.40)| ≤ 5 mm** on every label. Rule:
    the nearest circle (same layer) with that y within 1 cm. This resolves 23 of 24 (nearest is 0.7–2.9 m
    from the text). Unresolved: bare `+356.74` on PAB-08 (no circle at y 1.34).
  - Elevation points are projections: plan position = the façade plane + sheet x along `dir` (M1b placement).
    The true depth in front of or behind the façade is unknown. Several lie far beyond the house (e.g. PAB-08
    `Tp=Ti= +352.65` at sheet x −33.9 = the plot boundary). This is an M3 concern.
- Plan level labels (PAB-01) sit next to INSERT markers `Rzędne punktów - Rzędna punktu…`. M2 doesn't need
  their positions.
- Normalized sheets lose circle centres and the LINE/ARC/LWPOLYLINE identity, so label extraction has to run
  on raw entities in the worker.

Requirements:
- **Extraction in the worker** (pure `src/dwg/labels.ts`, no libredwg import, called from the worker next to
  `normalize`, on raw model-space entities). Output per sheet in sheet coords (m): the reference values found, and
  the absolute labels (kind `Tp` | `Ti` | `TpTi` | `bare`, value, point or none). Strip MTEXT first; decimal
  comma and dot.
- **Point association:** site sheets: the ARC leader from the label's rectangle to a circle. Elevation/section
  sheets: the height-matched circle (rule above). No match → no point (counted, not drawn). Never fall back to
  the text anchor. Bare labels are kept as `bare`; M3 decides how to use them.
- **Reference** = the value all reference labels agree on, shown once in the sheet list header
  (`±0.00 = 355.40 m n.p.m. (4 arkusze)`). None found, or they disagree → flagged there, and heights are shown
  relative only. No manual override.
- **Plan coordinates** through the existing placement: site sheets through their `transform` (M1c), vertical
  sheets through `origin + x·dir` (M1b). Sheets without a placement or transform show no markers.
- **Sheet list:** per sheet with absolute labels, `Rzędne: 7/8 z punktem`.
- **3D markers** for the resolved points: a small dot at (plan x, y, rel height) with a short label
  (`Tp 355.08 (−0.32)`). One toggle (default on, view setting, not saved). The markers are the browser check.
- **Rel + abs wherever we show a height:** one formatter, e.g. `+3.29 (358.69 m n.p.m.)`, used by the sheet list
  (plan z), the markers and the measure readout. The drawn sheet texts stay as drawn.
- **Measure tool "Pomiar"** (any view, Design viewport): click A, then B. Each click hits the plane of a drawn sheet under the
  cursor (horizontal: its z; vertical: its plane) and snaps to that sheet's visible segment endpoints and to the
  markers (screen-px radius, as in M1c). Readout: 3D distance, horizontal distance, Δh (m, 3 decimals), and both
  heights as rel + abs. The A–B line stays visible until Esc or the next measurement. Not saved.
- **Two viewports** (ADR 0001, user 2026-11-08): **Design** (everything from M1: sheets, PDF, layers, tools) and
  **Environment** (3D volumes, from M3 on), side by side, sharing one camera. In M2: markers in both, measure tool in
  design only, environment shows the ground grid and the markers.
- No change to `dancefloor.json`.

✅ The two viewports show the same camera at all times; everything from M1 still works in Design. The sheet list header shows 355.40 from 4 sheets. Counts: PZT-01 7/7, PAB-07 2/2, PAB-08 7/8, PAB-09 7/7,
PAB-10 7/7. In 3D, the elevation markers sit on their sheet circles (< 1 cm), and the PZT-01 markers sit on
PZT's circles (e.g. the `Tp= 355,08` circle at sheet (18.565, −11.038) is at plan (16.05, −14.46)). Measure: the
tank rectangle on PZT-01 is 3.00 × 2.40 m (± 1 cm), PAB-01's `A-WALL` x-extent is 15.090 m (± 1 cm), and on
PAB-08 Δh from ±0.00 to the ridge is 9.12 m (± 1 cm).

**M3 — Terrain grid** (spec sharpened 2026-11-08 on the real files, approved 2026-11-08)

Facts (raw model-space LINEs on `PZT_TEREN ISTNIEJĄCY` / `PZT_TEREN PROJEKTOWANY`, sheet coords in m):
- **Elevations** PAB-07..10: one existing-terrain profile each (8–12 LINEs, sheet x along the façade, y = height
  rel ±0.00), spanning roughly the plot (e.g. PAB-08 x −34.4…7.6, heights −2.80…+0.39). Every Ti / Tp=Ti label
  of M2 but one sits on a profile vertex (e.g. PAB-08 `Ti= +354.54` at x −14.97, profile vertex (−14.97, −0.86)).
  **Exception:** PAB-09 `Tp=Ti= +353.48` has its circle at x 21.47 (exactly 6.5 m S of the south façade plane), 0.81 m
  from the profile vertex of that height (22.28, −1.92); the profile gives −1.855 there (6.5 cm off). A drawing
  conflict, left as is (user, 2026-11-08: profiles only, normalization later). The
  SE corner Ti 354.54 and the SW corner Ti 354.05 agree between the two elevations that show them.
- **Noise in the elevations:** a legend pair (1.00 m horizontal `ISTNIEJĄCY` at y 3.78 and `PROJEKTOWANY` at y 3.38,
  far right) on every elevation, one isolated 0.40 m stub on PAB-08 (x −22.34…−21.94, y −1.92, 30 cm below the
  profile there), and one overlapping 0.64 m piece on PAB-10 (x −0.27…0.37, y −1.35, same height as its neighbours). Both are single segments that share no endpoint with another profile segment.
- **Sections** PAB-04..06: existing-terrain profiles (4–11 LINEs) across the whole cut, including under the house
  (PAB-06 has a gap there). Small gaps of ≤ 1 cm between consecutive segments (PAB-04). Short designed-terrain
  pieces (`PROJEKTOWANY`, 5–6 LINEs) around the house.
- **Consistency:** section A-A and section B-B agree where they cross (−0.78 vs −0.78). Elevation vs section
  differs by **15–18 cm** (PAB-08 vs B-B at (15.12, −6.36): −0.21 vs −0.39; PAB-10 vs A-A at (6.71, −14.97):
  −1.21 vs −1.36). The elevation terrain line is probably not cut at the façade plane. Both are used anyway (user,
  2026-11-08); near the crossings the surface gets small bumps.
- **PZT-01** `PZT_TEREN ISTNIEJĄCY` = 60 short slope-hatch ticks (an existing embankment along the SE and W edges),
  no heights. Not used.
- **Plot:** `PZT_ZAKRES` on PZT-01 is a closed 6-corner outline, **1043 m²**, plan bbox x −7.7…21.6, y −34.6…5.9
  (after the M1c rotation). At 0.10 m cells the grid is 314 × 426 ≈ 134k cells. The layer also has one isolated
  8.6 m LINE far off (legend sample), ignored like the profile legends (only segments with a neighbour count).

Requirements:
- **Seeds (pure `src/terrain/seeds.ts`, main thread, from the normalized `PZT_TEREN ISTNIEJĄCY` layer of every
  placed elevation and section):** chain segments whose endpoints meet within 2 cm; **drop segments with no
  neighbour** (legend, stub), counted per sheet. Densify the kept segments to ≤ 1 m spacing and map them to plan
  coords through the sheet's vertical placement (origin + x·dir, height = sheet y). Elevations go on their façade
  plane as placed in M1b. Unplaced sheets give no seeds.
- **Existing terrain = `terrain.base`** (pure `src/terrain/grid.ts`): delaunator over all seeds (duplicates within
  1 cm merged), linear interpolation inside the hull. Outside the hull: the height of the nearest point on the hull
  boundary (continuous, flat outward), and the cell is flagged **uncertain**. Grid: 0.10 m cells over the plot bbox
  + 2 m (1 m per side; `PZT_ZAKRES` through PZT-01's transform). Without an aligned PZT-01: seed bbox + 5 m (2.5 m per side).
- **Not saved (ADR 0002):** `terrain.base` is generated from the DWGs on load (no change to `dancefloor.json`). The
  environment editor (M4 on) edits a copy of the generated model; only the copy's edits are saved.
- **Tp:** no Tp surface in M3. The Tp points stay as M2 markers, for reference in M4 (user, 2026-11-08).
- **Survey points deferred** (user, 2026-11-08): no spot-height tool and no survey import in M3. Parts of the plot are
  outside the profile hull and show as uncertain until then.
- **Environment viewport:** the terrain mesh (one vertex per cell corner, height-tinted), uncertain cells drawn
  lighter and semi-transparent, contour lines every 0.25 m (marching squares, every 1 m thicker), and the plot
  outline. Toggle "Teren" (view setting, default on, not saved). Design is unchanged.
- **Visible checks (one panel line + Ti list):** seeds used / segments dropped, grid size, height range (rel + abs),
  uncertain share; the **Ti check**: for every resolved Ti / Tp=Ti marker the grid height at its point vs the label
  value, and the max |Δ|.
- **Best available, not exact** (user, 2026-11-08): the terrain will mostly be reshaped in the later editor, so
  M3 keeps the simplest approach that works. No conflict resolution between sources, no crossing analysis.

✅ Ti check: all Ti / Tp=Ti points within 2 cm, except the PAB-09 353.48 drawing conflict (see facts). Legend segments, the PAB-08 stub and the PAB-10 piece are dropped (6 in all). Contours every
0.25 m; uncertain area visibly different; orbiting the Environment view stays smooth (60 fps).

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
