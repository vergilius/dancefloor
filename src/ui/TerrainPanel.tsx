// Terrain summary (PLAN.md §5 M3): what the profiles gave, so the browser check can catch wrong seeds.
import { useTerrainSeeds } from '../state/terrain';
import { t } from './strings';

const m = (v: number) => v.toFixed(2);

export function TerrainPanel() {
  const seeds = useTerrainSeeds();
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
                {s.file.replace(/\.dwg$/i, '')}: {t.terrain.sheet(s.segments, s.points)}
                {s.dropped.length > 0 && (
                  <>
                    {' '}
                    · {t.terrain.dropped}: {s.dropped.map((d) => `x ${m(d.x1)}…${m(d.x2)}, y ${m(d.y)}`).join('; ')}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
