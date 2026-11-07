# Garden Levels — DWG-based 3D site planner (web)

Personal tool: load the architect's DWG sheets, see the house + plot in 3D, and design garden
levels (terraces, slopes, retaining walls) with exact heights. Not a general CAD editor.

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

## 3. Stack

| Concern | Choice |
|---|---|
| Build/UI | Vite + React + TypeScript |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` (CameraControls, Grid, TransformControls, Html) |
| DWG | `@mlightcad/libredwg-web` in a worker (copy `libredwg-web.wasm` to `public/wasm/`) |
| Picking/snapping | `three-mesh-bvh` |
| Terrain seed | `delaunator`, only to rasterize survey points into the grid |
| PDF underlay | `pdfjs-dist` (survey map until a DWG version exists) |
| State | `zustand` (+ simple command stack for undo/redo) |
| Persistence | File System Access API (project JSON next to the DWGs), IndexedDB fallback |
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
type Sheet = { id; file: string; role: 'ground' | 'attic' | 'roof' | 'site';
  elevation: number;               // m, where the sheet is drawn in 3D (e.g. 0, 3.29, 9.12)
  layers: Record<string, { visible: boolean; color?: string }> };
type Feature =
  | { kind: 'platform'; polygon: Vec2[]; z: number; material: 'grass'|'paving'|'gravel' }
  | { kind: 'slope'; from: FeatureId | Edge; ratio: number /* 1:n */ }
  | { kind: 'wall'; polyline: Vec2[]; top: number; thickness: number };
```

Designed surface = evaluate features in order over the grid. Never mutate `terrain.base`.

## 5. Milestones (each with acceptance criteria)

**M1 — DWG underlay viewer**
- Worker parses DWG → normalized geometry (LINE, ARC, CIRCLE, LWPOLYLINE, SPLINE→polyline,
  INSERT expanded with transforms, MTEXT as text sprites; skip HATCH/DIMENSION at first).
- Layer panel with per-layer toggle; default-hidden noise layers from §1.
- Each sheet placed at its `elevation`; sheets stack correctly (grids coincide).
- Sheet roles: `plan` (horizontal, at Z) | `elevation`/`section` (vertical plane; placed on a façade
  line, x calibrated by `S-GRID-1`, y = height rel. ±0.00) | `site` (horizontal, needs alignment).
- 2-point alignment tool (pick 2 points on sheet → 2 points on reference sheet) for PZT-01.
- ✅ All 11 files open in < 2 s each; plans stack; elevations stand on their façades; PZT aligned.

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
- Platform: draw polygon snapped to underlay vertices/edges, set Z numerically.
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
  parser or convert to DWG; don't rebuild the WASM.
- Utilities (`PZT_GAZ*`, `PZT_WODA P`, `PZT_KAN*`, `PZT_PRĄD`): show as an overlay and warn when a
  cut feature crosses them.
- Title block contains personal data — never commit sample DWGs to a public repo.
- Scale: 1 drawing unit = 1 mm; keep scene in metres.

## 7. Out of scope
Editing/saving DWG, dimensioning, printing sheets, multi-user, MEP, structural accuracy.
