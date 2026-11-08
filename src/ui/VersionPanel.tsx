// Active edit version in the sidebar (PLAN.md §5 M4a): totals against its frozen base, the last edit's z.
import { useMemo } from 'react';
import { formatHeight } from '../project/levels';
import { useRefValue } from '../state/levels';
import { useActiveVersion, useVersions, versionSurface } from '../state/versions';
import { rectSize, totals } from '../versions/edits';
import { ZInput } from './SheetList';
import { t } from './strings';

export function VersionPanel() {
  const version = useActiveVersion();
  const changeEdit = useVersions((s) => s.changeEdit);
  const ref = useRefValue();
  const sum = useMemo(() => version && totals(version.grid, versionSurface(version).base), [version]);
  if (!version || !sum) return null;
  const last = version.edits.at(-1);
  return (
    <>
      <h2>
        {t.versions.panelTitle}: {version.name}
      </h2>
      <p>
        {t.versions.totals(sum.cut, sum.fill, sum.net)}
        <br />
        <span className="muted">{t.versions.changed(sum.changed, sum.uncertainShare * 100)}</span>
      </p>
      {last ? (
        <>
          <h3>{t.versions.lastEdit}</h3>
          <p>
            {t.versions.tools[last.tool]} · {t.versions.rectSize(rectSize(last.rect).w, rectSize(last.rect).h, rectSize(last.rect).area)}
            <br />
            <label>
              {t.versions.zLabel}: <ZInput key={last.id} value={last.z} onChange={(z) => changeEdit(last.id, { z })} />
            </label>{' '}
            <span className="muted">{formatHeight(last.z, ref)}</span>
          </p>
        </>
      ) : (
        <p className="muted">{t.versions.noEdits}</p>
      )}
    </>
  );
}
