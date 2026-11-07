// Layer groups (project-wide) and per-sheet layer toggles (M1a T9).
import { useMemo } from 'react';
import type { NormalizedSheet } from '../dwg/types';
import { GROUP_IDS, groupOf, type GroupId } from '../project/layerGroups';
import { useProject, type SheetRow } from '../state/store';
import { t } from './strings';

/** One checkbox per group; applies to every sheet. */
export function GroupToggles() {
  const groups = useProject((s) => s.groups);
  const setGroup = useProject((s) => s.setGroup);
  return (
    <fieldset className="groups">
      <legend>{t.groupsTitle}</legend>
      {GROUP_IDS.map((g) => (
        <label key={g}>
          <input type="checkbox" checked={groups[g]} onChange={(e) => setGroup(g, e.target.checked)} /> {t.groups[g]}
        </label>
      ))}
    </fieldset>
  );
}

type LayerRow = { name: string; segments: number; texts: number };

/** Drawn layers of one sheet (segments and texts), by group, with counts. */
export function SheetLayers({ row, sheet }: { row: SheetRow; sheet: NormalizedSheet }) {
  const groups = useProject((s) => s.groups);
  const setLayer = useProject((s) => s.setLayer);
  const byGroup = useMemo(() => {
    const rows = new Map<string, LayerRow>();
    const get = (name: string) => rows.get(name) ?? rows.set(name, { name, segments: 0, texts: 0 }).get(name)!;
    for (const l of sheet.layers) get(l.name).segments += l.segments.length / 4;
    for (const x of sheet.texts) get(x.layer).texts++;
    const out = new Map<GroupId, LayerRow[]>(GROUP_IDS.map((g) => [g, []]));
    for (const r of [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'))) out.get(groupOf(r.name))!.push(r);
    return out;
  }, [sheet]);
  const total = [...byGroup.values()].reduce((n, rs) => n + rs.length, 0);

  return (
    <details className="layers">
      <summary>
        {t.layers} ({total})
      </summary>
      {GROUP_IDS.map((g) => {
        const rs = byGroup.get(g)!;
        if (rs.length === 0) return null;
        return (
          <div key={g} className={groups[g] ? '' : 'muted'}>
            <strong>{t.groups[g]}</strong>
            {rs.map((r) => (
              <label key={r.name} className="layer">
                <input
                  type="checkbox"
                  disabled={!groups[g]}
                  checked={row.layers?.[r.name]?.visible !== false}
                  onChange={(e) => setLayer(row.file, r.name, e.target.checked)}
                />{' '}
                {r.name}{' '}
                <span className="muted">
                  {r.segments > 0 && `${r.segments} ${t.segments}`}
                  {r.segments > 0 && r.texts > 0 && ', '}
                  {r.texts > 0 && `${r.texts} ${t.textsShort}`}
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </details>
  );
}
