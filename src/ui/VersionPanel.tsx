// Active edit version in the sidebar (PLAN.md §5 M4a): totals against its frozen base, and the edit list with each
// edit's size, z or dz (editable), and its cut / fill against the surface before it. Select = outlined in the view.
import { useMemo } from 'react';
import { formatHeight } from '../project/levels';
import { useRefValue } from '../state/levels';
import { useActiveVersion, useVersions, versionSurface } from '../state/versions';
import { EDGE_MODES, edgesOf, editValue, rectSize, SIDES, slopeOf, totals } from '../versions/edits';
import { ZInput } from './SheetList';
import { t } from './strings';

export function VersionPanel() {
  const version = useActiveVersion();
  const { selected, select, setEditValue, setEditShape, deleteEdit } = useVersions();
  const ref = useRefValue();
  const surface = useMemo(() => version && versionSurface(version), [version]);
  const sum = useMemo(() => version && surface && totals(version.grid, surface.grid.base), [version, surface]);
  if (!version || !surface || !sum) return null;
  return (
    <>
      <h2>
        {t.versions.panelTitle}: {version.name}
      </h2>
      <p>
        {t.versions.totals(sum.cut, sum.fill, sum.net)}
        <br />
        <span className="muted">{t.versions.changed(sum.changed)}</span>
      </p>
      {version.edits.length === 0 ? (
        <p className="muted">{t.versions.noEdits}</p>
      ) : (
        <>
          <h3>{t.versions.editsTitle}</h3>
          <ol className="edit-list">
            {version.edits.map((e, i) => {
              const size = rectSize(e.rect);
              const vol = surface.volumes[i]!;
              const edges = edgesOf(e);
              return (
                <li key={e.id} className={e.id === selected ? 'selected' : undefined}>
                  <button type="button" className="link" onClick={() => select(e.id === selected ? undefined : e.id)}>
                    <strong>{t.versions.tools[e.tool]}</strong> {t.versions.rectSize(size.w, size.h, size.area)}
                  </button>{' '}
                  <button type="button" className="link" title={t.versions.deleteEdit} aria-label={t.versions.deleteEdit} onClick={() => deleteEdit(e.id)}>
                    ✕
                  </button>
                  <br />
                  <label>
                    {e.tool === 'level' ? t.versions.zLabel : t.versions.dzLabel}{' '}
                    <ZInput
                      key={e.id}
                      value={editValue(e)}
                      accept={e.tool === 'level' ? undefined : (v) => v > 0}
                      onChange={(v) => setEditValue(e.id, v)}
                    />
                  </label>{' '}
                  <span className="muted">
                    {e.tool === 'level' ? formatHeight(e.z, ref) : `${e.tool === 'raise' ? '+' : '−'}${e.dz.toFixed(2)} m`}
                  </span>
                  <br />
                  <span className="edge-row">
                    {SIDES.map((side) => (
                      <label key={side} title={t.versions.sideTitles[side]}>
                        {t.versions.sides[side]}
                        <select value={edges[side]} onChange={(ev) => setEditShape(e.id, { edges: { ...edges, [side]: ev.target.value } })}>
                          {EDGE_MODES.map((m) => (
                            <option key={m} value={m}>
                              {t.versions.edgeModes[m]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    {SIDES.some((side) => edges[side] === 'slope') && (
                      <label title={t.versions.slopeTitle}>
                        1:
                        <ZInput key={`${e.id}/slope`} value={slopeOf(e)} accept={(v) => v > 0} onChange={(v) => setEditShape(e.id, { slope: v })} />
                      </label>
                    )}
                  </span>
                  <br />
                  <span className="muted">{t.versions.editVolume(vol.cut, vol.fill)}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}
