// Wersja tab (PLAN.md §5 M4a, UI rework): the Inspector for the selected edit (or the defaults for the next one),
// totals against the frozen base, and the edit list with each edit's size and cut / fill. Select = outlined in the view.
import { useMemo } from 'react';
import { Trash } from 'lucide-react';
import { formatHeight } from '../project/levels';
import { useRefValue } from '../state/levels';
import { useActiveVersion, useVersions, versionSurface } from '../state/versions';
import { balanceZ, edgeHeights, edgesOf, editValue, rectSize, SIDES, slopeOf, totals, type Edit } from '../versions/edits';
import type { HeightGrid } from '../terrain/grid';
import { EdgeControls } from './EdgeControls';
import { wallSolid } from '../versions/walls';
import { ZInput } from './SheetList';
import { t } from './strings';

type Surface = ReturnType<typeof versionSurface>;

export function VersionPanel() {
  const version = useActiveVersion();
  const { selected, select, deleteEdit } = useVersions();
  const surface = useMemo(() => version && versionSurface(version), [version]);
  const sum = useMemo(() => version && surface && totals(version.grid, surface.grid.base), [version, surface]);
  if (!version || !surface || !sum) return <p className="muted">{t.tools.needsVersion}</p>;
  const index = version.edits.findIndex((e) => e.id === selected);
  return (
    <>
      <section className="inspector">
        {index >= 0 ? (
          <>
            <h3>
              {t.shell.inspector} {index + 1}: {t.versions.tools[version.edits[index]!.tool]}
            </h3>
            <EditDetails edit={version.edits[index]!} index={index} surface={surface} balance={() => balanceZ(version.grid, version.edits, index)} />
          </>
        ) : (
          <NewEditDefaults />
        )}
      </section>
      <h3>{version.name}</h3>
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
                  <button type="button" className="row" onClick={() => select(e.id === selected ? undefined : e.id)}>
                    <strong>{t.versions.tools[e.tool]}</strong> {t.versions.rectSize(size.w, size.h, size.area)}
                    {e.tool !== 'wall' && <span className="muted"> · {t.versions.editVolume(vol.cut, vol.fill)}</span>}
                  </button>
                  <button type="button" className="icon-btn" title={t.versions.deleteEdit} aria-label={t.versions.deleteEdit} onClick={() => deleteEdit(e.id)}>
                    <Trash size={14} />
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}

/** No selection: the 1:n the next edit's slopes get. */
function NewEditDefaults() {
  const { newSlope, setNewSlope } = useVersions();
  return (
    <>
      <h3>{t.shell.newEdits}</h3>
      <label className="field" title={t.versions.slopeNewTitle}>
        {t.versions.slopeNew} 1: <ZInput key="new" value={newSlope} accept={(v) => v > 0} onChange={setNewSlope} />
      </label>
    </>
  );
}

function EditDetails({ edit: e, index, surface, balance }: { edit: Edit; index: number; surface: Surface; balance: () => number | undefined }) {
  const { setEditValue, setEditShape, setNewSlope, deleteEdit, replaceEdit } = useVersions();
  const ref = useRefValue();
  const vol = surface.volumes[index]!;
  const size = rectSize(e.rect);
  return (
    <div className="details">
      <div>{t.versions.rectSize(size.w, size.h, size.area)}</div>
      <label className="field">
        {e.tool === 'level' ? t.versions.zLabel : e.tool === 'wall' ? t.versions.topLabel : t.versions.dzLabel}{' '}
        <ZInput
          key={e.id}
          value={editValue(e)}
          accept={e.tool === 'level' || e.tool === 'wall' ? undefined : (v) => v > 0}
          onChange={(v) => setEditValue(e.id, v)}
        />{' '}
        <span className="muted">
          {e.tool === 'level' || e.tool === 'wall' ? formatHeight(editValue(e), ref) : `${e.tool === 'raise' ? '+' : '−'}${e.dz.toFixed(2)} m`}
        </span>
      </label>
      {e.tool === 'level' && e.tilt && (e.tilt.x !== 0 || e.tilt.y !== 0) && (
        <div className="muted">
          {t.versions.rampLabel}: {SIDES.map((s) => `${t.versions.sides[s]} ${formatHeight(edgeHeights(e)[s], undefined)}`).join(' · ')}
        </div>
      )}
      {e.tool === 'wall' ? (
        <WallInfo grid={surface.grid} edit={e} />
      ) : (
        <>
          <EdgeControls
            id={e.id}
            edges={edgesOf(e)}
            slope={slopeOf(e)}
            onChange={(shape) => {
              // A ratio typed here also becomes the default for the next edit (as in the old bar).
              if (shape.slope !== undefined) setNewSlope(shape.slope);
              setEditShape(e.id, shape);
            }}
          />
          <div className="muted">{t.versions.editVolume(vol.cut, vol.fill)}</div>
          {e.tool === 'level' && (
            <button
              type="button"
              title={t.versions.balanceTitle}
              onClick={() => {
                const z = balance();
                if (z !== undefined) replaceEdit({ ...e, z });
              }}
            >
              {t.versions.balance}
            </button>
          )}
        </>
      )}
      <button type="button" className="danger" onClick={() => deleteEdit(e.id)}>
        <Trash size={14} /> {t.versions.deleteEdit}
      </button>
    </div>
  );
}

/** A wall's height above the terrain and its volume, on the version's current surface. */
function WallInfo({ grid, edit }: { grid: HeightGrid; edit: Edit & { tool: 'wall' } }) {
  const w = useMemo(() => wallSolid(grid, edit), [grid, edit]);
  return <div className="muted">{t.versions.wallInfo(w.hMin, w.hMax, w.volume)}</div>;
}
