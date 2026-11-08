// Active edit version in the sidebar (PLAN.md §5 M4a): totals against its frozen base, and the edit list with each
// edit's size, z or dz (editable), and its cut / fill against the surface before it. Select = outlined in the view.
import { useMemo } from 'react';
import { formatHeight } from '../project/levels';
import { useRefValue } from '../state/levels';
import { useActiveVersion, useVersions, versionSurface } from '../state/versions';
import { edgeHeights, edgesOf, editValue, rectSize, SIDES, slopeOf, totals } from '../versions/edits';
import { EdgeControls } from './EdgeControls';
import { walls } from '../versions/walls';
import { ZInput } from './SheetList';
import { t } from './strings';

export function VersionPanel() {
  const version = useActiveVersion();
  const { selected, select, setEditValue, setEditShape, deleteEdit } = useVersions();
  const ref = useRefValue();
  const surface = useMemo(() => version && versionSurface(version), [version]);
  const sum = useMemo(() => version && surface && totals(version.grid, surface.grid.base), [version, surface]);
  const wallList = useMemo(() => (version && surface ? walls(surface.grid, version.edits) : []), [version, surface]);
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
                  {e.tool === 'level' && e.tilt && (e.tilt.x !== 0 || e.tilt.y !== 0) && (
                    <>
                      <br />
                      <span className="muted">
                        {t.versions.rampLabel}: {SIDES.map((s) => `${t.versions.sides[s]} ${formatHeight(edgeHeights(e)[s], undefined)}`).join(' · ')}
                      </span>
                    </>
                  )}
                  <br />
                  <EdgeControls id={`${e.id}/list`} edges={edgesOf(e)} slope={slopeOf(e)} onChange={(shape) => setEditShape(e.id, shape)} />
                  <br />
                  <span className="muted">{t.versions.editVolume(vol.cut, vol.fill)}</span>
                  {wallList
                    .filter((w) => w.edit === e.id)
                    .map((w) => (
                      <span key={w.side} className="muted">
                        <br />
                        {t.versions.wall(t.versions.sides[w.side], w.length, w.hMin, w.hMax, w.volume)}
                      </span>
                    ))}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}
