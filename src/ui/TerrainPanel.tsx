// Terrain summary (PLAN.md §5 M3): what the profiles and the grid gave, so the browser check can catch errors.
import { useMemo } from 'react';
import { formatHeight, formatRel } from '../project/levels';
import { useLevelMarkers } from '../scene/LevelMarkers';
import { useDrawnSheets } from '../state/drawn';
import { useRefValue } from '../state/levels';
import { useTerrain } from '../state/terrain';
import { sampleGrid, type HeightGrid } from '../terrain/grid';
import { t } from './strings';

const m = (v: number) => v.toFixed(2);
const sheetName = (file: string) => file.replace(/\.dwg$/i, '');

export function TerrainPanel() {
  const { seeds, grid, extent } = useTerrain();
  const ref = useRefValue();
  const dropped = seeds.sheets.reduce((n, s) => n + s.dropped.length, 0);
  return (
    <>
      <h2>{t.terrain.title}</h2>
      {seeds.sheets.length === 0 ? (
        <p className="muted">{t.terrain.none}</p>
      ) : (
        <>
          <p>{t.terrain.seeds(seeds.points.length / 3, seeds.sheets.length, dropped)}</p>
          <ul className="muted terrain-sheets">
            {seeds.sheets.map((s) => (
              <li key={s.file}>
                {sheetName(s.file)}: {t.terrain.sheet(s.segments, s.points)}
                {s.dropped.length > 0 && (
                  <>
                    {' '}
                    · {t.terrain.dropped}: {s.dropped.map((d) => `x ${m(d.x1)}…${m(d.x2)}, y ${m(d.y)}`).join('; ')}
                  </>
                )}
              </li>
            ))}
          </ul>
          {grid ? <GridSummary grid={grid} extent={extent} refValue={ref} /> : <p className="muted">{t.terrain.noGrid}</p>}
        </>
      )}
    </>
  );
}

function GridSummary({ grid, extent, refValue }: { grid: HeightGrid; extent: 'plot' | 'seeds'; refValue: number | undefined }) {
  const stats = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let unc = 0;
    for (let i = 0; i < grid.base.length; i++) {
      min = Math.min(min, grid.base[i]!);
      max = Math.max(max, grid.base[i]!);
      unc += grid.uncertain[i]!;
    }
    return { min, max, uncertainPct: (100 * unc) / grid.base.length };
  }, [grid]);
  return (
    <>
      <p>
        {t.terrain.grid(grid.cols, grid.rows, grid.cell)}
        <br />
        <span className="muted">{t.terrain.extent[extent]}</span>
        <br />
        {t.terrain.range}: {formatHeight(stats.min, refValue)} … {formatHeight(stats.max, refValue)}
        <br />
        {t.terrain.uncertain(stats.uncertainPct)}
      </p>
      <TiCheck grid={grid} refValue={refValue} />
    </>
  );
}

/** Every resolved Ti / Tp=Ti marker: label height vs the grid at its plan point. */
function TiCheck({ grid, refValue }: { grid: HeightGrid; refValue: number | undefined }) {
  const markers = useLevelMarkers(useDrawnSheets());
  const rows = useMemo(
    () =>
      markers
        .filter((mk) => mk.kind === 'Ti' || mk.kind === 'TpTi')
        .map((mk) => {
          const label = refValue === undefined ? mk.world[2] : mk.value - refValue;
          const g = sampleGrid(grid, mk.world[0], mk.world[1]);
          return { mk, label, g, d: g - label };
        }),
    [markers, grid, refValue],
  );
  const max = rows.reduce((a, r) => Math.max(a, Math.abs(r.d)), 0);
  return (
    <>
      <h3>{t.terrain.tiTitle}</h3>
      {rows.length === 0 ? (
        <p className="muted">{t.terrain.tiNone}</p>
      ) : (
        <>
          <p>{t.terrain.tiMax(max * 100)}</p>
          <ul className="muted terrain-sheets">
            {rows.map((r, i) => (
              <li key={i}>
                {sheetName(r.mk.file)} {r.mk.label}: {t.terrain.tiRow(formatRel(r.g), formatRel(r.d * 100, 1))}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
