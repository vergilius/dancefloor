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
- **Generated model, edited as a copy (ADR 0002, 0003):** DWG-derived 3D (terrain, massing) is generated on load and
  never saved or edited. Environment previews it; edits happen in **versions** (frozen snapshots, many per project,
  saved as files in `dancefloor-versions/`), never in the generated model or `dancefloor.json`.
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
**Superseded for M4 (ADR 0003):** `terrain` and `features` are not in the project JSON. Each edit version holds its
own frozen grid and ordered edits (rect tools Podnieś / Obniż / Wyrównaj in M4a); see §5 M4a.

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

**M3 — Terrain grid** — done 2026-11-08 (spec sharpened 2026-11-08 on the real files, approved 2026-11-08)

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
  1 cm merged), linear interpolation inside the hull. Outside the hull: an inverse-distance (1/d²) average of the hull
  boundary (sampled every 0.5 m) plus its nearest point, so the surface meets the hull without a step and evens out
  towards the boundary average out to the edge (user, 2026-11-08: no "uncertain" area; was flat nearest-hull height,
  flagged uncertain and drawn lighter). Grid: 0.10 m cells over the bbox of the
  plot outline (`PZT_ZAKRES` through PZT-01's transform) grown by 2 m with sharp (mitred) corners, every edge moved out
  parallel; corners of the grid outside that polygon are masked out (PZT-01: 1043 m² → 1320 m²) (not drawn, edited or counted; the plot boundary is the reference, user 2026-11-08, was bbox + 1 m). Without an aligned PZT-01: seed bbox + 5 m (2.5 m per side).
- **Not saved (ADR 0002):** `terrain.base` is generated from the DWGs on load (no change to `dancefloor.json`). The
  environment editor (M4 on) edits a copy of the generated model; only the copy's edits are saved.
- **Tp:** no Tp surface in M3. The Tp points stay as M2 markers, for reference in M4 (user, 2026-11-08).
- **Survey points deferred** (user, 2026-11-08): no spot-height tool and no survey import in M3. Parts of the plot are
  outside the profile hull; their heights are only the averaged extension until then.
- **Environment viewport:** the terrain mesh (one vertex per cell corner, height-tinted, one look
  everywhere), contour lines every 0.25 m (marching squares, every 1 m thicker), and the plot
  outline. Toggle "Teren" (view setting, default on, not saved). Design is unchanged.
- **Visible checks (one panel line + Ti list):** seeds used / segments dropped, grid size, height range (rel + abs),
  modelled area (m²); the **Ti check**: for every resolved Ti / Tp=Ti marker the grid height at its point vs the label
  value, and the max |Δ|.
- **Best available, not exact** (user, 2026-11-08): the terrain will mostly be reshaped in the later editor, so
  M3 keeps the simplest approach that works. No conflict resolution between sources, no crossing analysis.

✅ Ti check: all Ti / Tp=Ti points within 2 cm, except the PAB-09 353.48 drawing conflict (see facts). Legend segments, the PAB-08 stub and the PAB-10 piece are dropped (6 in all). Contours every
0.25 m over the whole modelled area; orbiting the Environment view stays smooth (60 fps).

**M4 — Terrain editing (core value)**, four sub-milestones (capability map, user 2026-11-08):

How editing works (ADR 0003): Design places the DWGs and produces the **generated model**. Environment previews it
live and read-only (**"Podgląd"**). The user exports it to an **edit version**: a frozen snapshot that only edits
change. There can be many versions, each created, edited and deleted independently, saved as files in the project
folder automatically. Tools act on **areas** (rectangles on a 0.5 m tile lattice), like the terrain tools of old
simulation games, not on single cells and not on drawn polygons.

| Sub-milestone | Contents | Depends on |
|---|---|---|
| **M4a** Versions + editor core | export / list / rename / delete versions, file storage with autosave, preview vs edit, edit list with undo/redo, tools Podnieś / Obniż / Wyrównaj, cut/fill, Δh map | M3 |
| **M4b** Bevel + retaining wall | edges of an edit slope 1:n to the surroundings instead of a step; a retaining wall along an edit edge instead | M4a |
| **M4c** Textured path | a path strip with width and material (paving with build-up T1 = 0.51 m, PAB-11; gravel), cross-fall open | M4a |
| **M4d** Obstacles | utilities + tank (1.7 m + 0.2 m bed) with depth, warning when a cut reaches them, truck access fence → tank | M4a |

Build order M4a → **M5** → M4b → M4c → M4d (ADR 0004: the house first, the other tools are judged against it). The original ✅ (terrace at +0.30 next to the house with a 1:2 slope to −0.32,
volumes update live) closes with M4b.

**M4a — Versions + editor core** — done 2026-11-08 (spec approved 2026-11-08)

Requirements:
- **Preview vs version (Environment view bar):** a selector "Podgląd" | the versions by name. Podgląd shows the
  generated model live (as in M3), read-only, no edit tools. Buttons: **"Nowa wersja"** (snapshot of the current
  generated terrain, named "Wersja n", opened right away), **"Zmień nazwę"**, **"Usuń"** (confirm). The Design
  viewport is unchanged in every mode.
- **A version** = frozen `base` + outside mask + grid geometry (copied at export, never regenerated) + an ordered
  list of **edits**. Its surface = edits applied in order over its frozen base. Changing the DWGs later doesn't touch
  existing versions. Without a generated terrain (no seeds), "Nowa wersja" is disabled.
- **Storage (pure `src/versions/file.ts` + folder I/O):** subfolder `dancefloor-versions/` in the project folder;
  per version `<id>.json` (`{ version: 2, id, name, created, grid: { cell, origin, cols, rows }, edits: [...] }`,
  parsed strictly) and `<id>.bin` (base Float32 + outside mask Uint8, ≈ 0.7 MB; version 1 files also had an uncertain
  Uint8 section, skipped on read). Listed on folder load (unreadable
  files flagged, not deleted). **Autosave:** the JSON is written 1 s after the last change; the .bin only at export.
  A save error shows in the bar. Versions are not in `dancefloor.json`.
- **Edits** (pure `src/versions/edits.ts`): `{ id, tool, rect: { x0, y0, x1, y1 } /* plan m, on the 0.5 m lattice */,
  … }` with tools **Podnieś** (`dz` > 0, default 0.10 m), **Obniż** (`dz` > 0, applied down, default 0.10 m), and
  **Wyrównaj** (`z` rel ±0.00, default = mean height under the rect before the edit, rounded to 1 cm). A grid corner
  inside the rect (edges included) is changed; a later edit wins on top of an earlier one. Replayed from scratch on
  every change (target < 30 ms).
- **Picking:** with a tool active, drag on the terrain (ray marched over the version's height grid, `rayGrid` in `src/terrain/grid.ts`; a heightfield needs no BVH, user OK 2026-11-08); the rect
  snaps to the 0.5 m lattice and shows its size (m × m) while dragging; release applies the edit. Esc cancels the drag.
  Tile lattice anchored at plan (0, 0) = the S-GRID-1 origin.
- **Edit list (panel):** each edit with tool, size, dz or z (rel + abs), its cut / fill (m³, against the surface
  before it). Select = rect outlined in the view; change dz / z numerically; delete. Undo / redo (Ctrl+Z /
  Ctrl+Shift+Z, and buttons) over add, change and delete, per version, not saved (cleared on folder load).
- **Volumes:** each grid corner stands for one cell area (0.10 × 0.10 m). Version totals against its frozen base:
  **cut** = Σ max(0, base − h) × a, **fill** = Σ max(0, h − base) × a, net = fill − cut, m³ to 0.01, plus the number of changed
  corners.
- **View in a version:** mesh and contours show the version's surface (contours may update on release). Toggle
  **"Różnice"**: colours by Δh = surface − frozen base, red = cut, blue = fill, white = 0, saturated at ±1.0 m, with
  a small legend. The step at an edit's edge is a one-cell-wide steep strip until M4b's bevel.

Out of M4a: bevel, walls (M4b); paths, materials, build-up (M4c); obstacles (M4d); moving or resizing an edit's rect
(delete and redraw); duplicating a version; a Tp surface.

✅ "Nowa wersja" from Podgląd; Wyrównaj a 4 × 6 m rect next to the house to +0.30: the list shows 24.00 m² and the
totals change. Change z to +0.40: net grows by 2.50 m³ (41 × 61 corners × 0.01 m² × 0.10: edge corners are included, user 2026-11-08). Podnieś a 1 × 1 m
rect by 0.10 → net +0.10 m³ (± one cell row). Undo/redo restore the totals exactly. A second version edited
differently keeps its own totals. Reload the app → both versions and their totals are back. Delete one → its files
are gone. Podgląd and Design unchanged; orbiting stays smooth.

**M5 — House massing** (spec sharpened 2026-11-08 on the real files, approved 2026-11-08; ADR 0005)

Facts (normalized sheets, plan coords in m, heights rel ±0.00):
- **No wall loops:** PAB-01 `A-WALL` = 246 LINEs, 186 open ends, no closed loop at 1 or 10 mm. Auto-tracing the
  footprint failed in three prototypes (ADR 0005). Not attempted.
- **Main body = plain gable house.** PAB-03 `A-ROOF` extent x 0.334…15.134, y −11.776…−1.476 (14.80 × 10.30 m) =
  the attic walls; `A-ROOF-OTLN` reaches y −11.932…−1.319 (overhang 0.156 m on the long sides, 0 on the gable ends).
  Ridge along x at +9.12 (= PAB-03's z), pitch label `38° / 78.13%`. Roof surface at the wall face = 9.12 − 5.15 ×
  tan 38° = **+5.10**, matching `A-ROOF-OTLN` 4.86…5.10 on PAB-04/07/08/10. Two eave windows break the south eave
  (x 5.29…6.93, 9.19…10.01); not modelled as roof shape.
- **North annex** (garage, floor ≈ +0.28/+0.30): single storey, flat roof with parapet at **+3.59** (PAB-04, PAB-07,
  PAB-08), outside the main roof towards y +3.05. Its corners are on PAB-01 `A-WALL`.
- **Terrace roof** (south-west): slab **+2.635…+3.22** over x 0.03…8.12, from the south wall out to y −14.97, on two
  0.55 × 0.48 m posts (x 0.03…0.58 and 7.57…8.12, y −14.97…−14.49, from −0.02); 7 columns `S-COLS` (0.20 × 0.03 m, −0.02…+2.63 on PAB-04) on its east side
  (x 7.72…7.92, y −14.44…−12.90). PAB-10, PAB-08, PAB-01.
- **Openings:** on each placed elevation, `A-GLAZ*` + `A-DOOR*` (not the swing layer) joined within 5 mm into pieces;
  bboxes ≥ 0.3 × 0.3 m; overlapping boxes merged. Counts: PAB-10 S 6 (terrace door 1.45…4.17 × 0…2.46, two windows,
  two eave windows 4.23…6.25, side door), PAB-09 W 8, PAB-08 E 7, PAB-07 N 1. Known faults: on PAB-08 the gable
  windows and roof windows merge into one box (sheet x −10.07…−6.68, +3.29…+8.00); roof windows (PAB-07's single
  box, two on PAB-08) come out as façade openings.
- Ground at the house: Ti at the corners 354.05…355.70 (−1.35…+0.30); foundations −1.40/−1.70/−2.00 (sections).

Requirements:
- **Blocks** (pure `src/house/blocks.ts`): the house is an ordered list of blocks, each a closed solid; they may
  overlap (no booleans).
  - `gable`: rectangle `{x0, y0, x1, y1}`, `bottom`, `ridge`, `pitch` (deg), `overhang` (m, long sides only). Ridge
    along the long side, centred. Derived and shown: wall-face height = ridge − (short side / 2) × tan(pitch).
    Optional `recesses` (rectangles with `bottom`, `top`) cut out of its walls: the east podcień, from
    "Z rzutu parteru" (ADR 0005 amendment).
  - `flat`: polygon (≥ 3 corners, plan m), optional `holes` (openings through it), `bottom`, `top`.
  - Defaults: `bottom` = −1.40 (top of the shallowest foundation, so walls reach into the sloped terrain without a
    gap); heights typed in the panel or picked from the level values found on the sheets (M2 labels). Rel + abs
    shown everywhere.
- **"Z rzutu dachu"** (button): builds or replaces the block named "Bryła główna" as a `gable` from the horizontal
  sheet that has an `A-ROOF` layer: rect = `A-ROOF` extent, overhang = (`A-ROOF-OTLN` extent − rect) on the long
  sides, ridge = the sheet's z, pitch parsed from the `NN°` label on that sheet (fallback 38, flagged).
- **"Z rzutu parteru"** (button, ADR 0005 amendment): from the ground plan around the main body, builds or updates
  "Dobudówka <side>" (long `A-WALL` lines beyond one side, bbox closed to the main wall), "Płyta n" (`A-DETL-1` chain
  closed along the main rectangle), "Podest" (the `PZT_UTWARDZENIA` outline, gaps at the posts bridged; top = the
  supports' bottom), "Słup n" (small closed 4-sided `A-WALL` loops), "Filar n" (small open `A-WALL` chains against
  the main wall; deck → top of the slab above) and "Kolumna n" (closed 4-sided
  `S-COLS*` loops, heights from the `S-COLS*` extent on a placed section/elevation: 7 × 0.20 × 0.03 m, −0.02…+2.63). Heights are read from the placed
  elevations (horizontal `A-WALL`, then `PZT_UTWARDZENIA` lines across the block's width, elevations where it is
  hidden behind the main body skipped; annex: top only) and the columns' from a section's `S-COLS`; each is listed
  with its sheet. Blocks with nothing found keep their heights (new: −1.40 / +3.00, flagged). Counts and skipped loops/openings shown. The height list also
  offers the relative `+N.NN` labels of the elevations and sections.
- **Drawing a flat block** (Design viewport, like the measure tool): "Dodaj blok" → click corners with endpoint
  snapping (`snap.ts`); click the first corner or press Enter to close; Esc cancels; Backspace removes the last
  corner. While drawing: outline + edge lengths. Then it gets name "Blok n", top +3.00 (to be changed). A block is
  re-drawn the same way ("Rysuj ponownie" keeps its heights). Footprints of all blocks show as outlines in Design
  while the house panel is open.
- **Openings** (pure `src/house/openings.ts`, from every placed elevation, M1b placement): rects as in the facts,
  mapped to 3D on the elevation plane, then moved along the view direction to the first block face hit by a ray
  through the rect centre (three `Raycaster` on the house meshes; no hit within 20 m → not drawn, counted). Drawn as
  dark quads 1 cm proud of that face. Each opening can be hidden (key = sheet + rect rounded to 1 cm); the hidden list
  is saved. Only façade openings, no roof windows on the roof plane, no reveals.
- **Saved** in `dancefloor.json` as optional `house: { blocks, hiddenOpenings }` (file `version` stays 1). Not in the
  edit versions: one house for all terrain versions.
- **Environment viewport:** blocks as plain light-grey solids with flat shading, openings dark; toggle **"Dom"** next
  to "Teren" (view setting, default on, not saved). Terrain is not cut under the house. Design shows no solids.
- **House panel ("Dom"):** block list (name, kind, size m × m or area m², heights rel + abs, wall-face height and
  pitch for gables), rename, change heights, re-draw, delete; "Z rzutu dachu", "Dodaj blok"; openings line:
  found / drawn / not placed / hidden per elevation, with a list to hide/show each.

Out of M5: roof shapes other than one gable per block (hips, dormers, the eave-window breaks), wall thickness,
interior, openings on the roof plane, editing an opening's rect, materials/textures, IFC (`web-ifc`, only if the file
arrives), cutting the terrain under the house.

✅ "Z rzutu dachu" → "Bryła główna" 14.80 × 10.30 m, ridge +9.12 (364.52 m a.s.l.), pitch 38°, wall face +5.10,
overhang 0.16 m. Its edges coincide with PAB-10 and PAB-08 placed as underlays (eaves, ridge, gable outline, < 1 cm
by measuring). Annex drawn by snapping to PAB-01 `A-WALL` corners, top +3.59; terrace roof slab +2.635…+3.22 and two
posts drawn the same way. Openings: PAB-10 shows its 6 on the south face (terrace door under the terrace roof), the
merged PAB-08 box can be hidden, and hiding survives a reload. A Wyrównaj +0.30 next to the south façade meets the
wall without a gap. Reload → the house is back. Podgląd, versions, Design unchanged; orbiting stays smooth.

**M5b — Hollow house** (spec drafted 2026-11-08 on the real files, approved 2026-11-08 ("dobra"); ADR 0006). Open
questions 1–2 unanswered: built with the spec's defaults (full-height interior door slots, attic floor = the placed PAB-02 z).
**Amended 2026-11-08 (ADR 0006 amendment): exterior walls are one shell along the block outlines (0.475 m, from the
`I-WALL` pairs), partitions are pairs of parallel lines 5–35 cm apart, roof windows are holes in the roof planes; the
requirements below that extrude every line are superseded.** Earlier notes: openings cut the wall lines between sill and head (the plans draw lines across
the garage door and the podcień doors), so a plan gap isn't required; a cut needs a wall face within 0.25 m of the
placed opening. Slabs on the real files: ground −0.45…0.00 (PAB-04), ceiling +2.82…+3.29 (PAB-05), garage floor
−0.15…+0.30 and roof +2.82…+3.59 (PAB-04). Camera: double-click sets the orbit point, `infinityDolly` with
minDistance 1 m lets zooming pass through walls. User,
2026-11-08: "żeby bryła domu i garażu była dziurawa w środku … kamera wjedzie do domu … zobaczyć wszystkie ściany i
dziury z okien i drzwi", option 1 (all walls, exterior and partitions, real openings). Built after M5 T3 (the
elevation openings are its input); M5 T4 (hiding openings) stays.

Facts (PAB-01, PAB-02, PAB-04, PAB-05; plan coords m, heights rel ±0.00):
- **Wall layers** (both plans): `I-WALL` = exterior walls, both faces 0.47–0.48 m apart, with jamb lines across the
  wall at the openings; `I-WALL-1` = a layer line inside the exterior walls; `A-WALL-1` = partitions 0.12 / 0.25 m;
  `A-WALL` = the outer face, more partition faces, posts and piers. PAB-01: 98 / 69 / 109 / 246 segments, PAB-02:
  75 / 119 / 71 / 312.
- **No closed pieces:** PAB-01 `I-WALL` 40 pieces, 0 closed, 81 open ends; `A-WALL-1` 18 pieces, 1 closed. Walls
  can't be found as solids; each line becomes a vertical face (a wall drawn with two lines gets two faces, so it reads
  as thick from inside). Plan gaps = openings.
- **Levels** (PAB-05 B-B): ground floor 0.00 (slab down to −0.45), ceiling `A-FLOR-2` +2.82, floor build-up to
  +3.22, attic plan at +3.29. Garage (PAB-04 A-A): floor +0.30, ceiling `A-FLOR-2` +2.82, parapet +3.59.
- Interior doors are not on the elevations; their heads aren't known from the files read so far.

Requirements:
- **Storeys** = horizontal plan sheets with wall layers, by z (PAB-01 at 0.00, PAB-02 at +3.29). The main body's recesses (podcień) come for free: its ground wall is drawn there. A storey's wall
  lines (`I-WALL`, `I-WALL-1`, `A-WALL`, `A-WALL-1`; segments < 2 cm and duplicates of another layer's line dropped)
  are extruded as double-sided vertical faces from its z to the next storey's z; on the top storey up to the gable
  roof surface (each face's top follows the roof planes, split at the ridge). Exterior walls (`I-WALL`, `A-WALL`
  outside the partitions) on the ground storey start at the block bottom (−1.40), so they meet the terrain.
- Lines inside the annex rectangle belong to the annex: floor → its top (+3.59). Lines in no house block are skipped
  (posts, piers, deck: already blocks).
- **Slabs:** between storeys one slab over the main body rectangle, from the ceiling to the next storey's z; ceiling
  = the highest `A-FLOR-2` line below the slab top on a placed section crossing the block (+2.82); annex roof from its
  ceiling (+2.82) to its top. Ground slab 0.00 … −0.45 under the main body and the annex (−0.45 = lowest `A-FLOR-2`
  line). No stair opening (out of M5b).
- **Exterior openings** (from M5 T3: each elevation rect placed on the first wall face behind it): the plan gap is
  already there; a sill fill (storey floor or block bottom → sill) and a head fill (head → storey top) close the
  rest, the rect's width × the wall thickness (the `I-WALL` face distance at that point). Doors: head fill only.
  Openings that land on no plan gap: still drawn as dark quads (counted).
- **Interior doors:** plan gaps in partitions stay full height (floor → ceiling slot) — simplification, see open
  question 1.
- **Main body and annex** are no longer drawn as solids in Environment: their walls, slabs and roof are. Their
  blocks stay (data, roof, opening placement). Other blocks (slab, deck, posts, columns, pier) unchanged.
- **Looking inside:** double-click on a surface in Environment orbits around that point (`setOrbitPoint`), so the
  camera can be put into a room by zooming; near plane 0.1 m.
- **Panel:** per storey: wall faces, total length, skipped segments; slabs with heights and source sheet; openings
  filled / not on a gap.

Out of M5b: stairs and the stair opening, furniture, interior door heads (until question 1), wall materials, caps on
wall tops, the attic floor's own outline (the main rectangle is used), cutting the roof for roof windows.

✅ Zoomed into the living room from the south terrace door: the partitions of PAB-01 stand where the plan shows them
(Design top view, < 1 cm), the south windows are holes with sill and head as on PAB-10, the ceiling at +2.82 and the
attic floor at +3.29 are there; in the attic the gable walls reach the ridge and the knee walls meet the roof
planes; the garage has its door hole (PAB-08) and its ceiling at +2.82. From outside the house still matches the
renders. Orbiting stays smooth.

Open questions:
1. Interior door heads: full-height slots (as specified) or a head fill at a fixed height (e.g. +2.05 above the
   floor, flagged as assumed)?
2. Attic floor: +3.29 (the placed PAB-02) or +3.22 (the `A-FLOR-1` finish line on PAB-05)?

**M6 — Output**
- Save/load project JSON; screenshot; glTF export (`GLTFExporter`).
- Optional: export designed contours as DXF for the architect (simple R12 writer).

## 6. Risks / notes for implementation
- MTEXT contains inline formatting (`\fArial|b0|i0|c238|p34|;\W.8;…`, `\P`) — strip before display/regex.
- Level markers are INSERTs without readable attributes; the value is a separate MTEXT nearby —
  associate by proximity if needed.
- Walls are segmented LINEs with gaps at openings; loop detection failed on the real files (ADR 0005), so M5
  footprints are drawn by hand except the main body (from the roof plan).
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
