// Right panel (UI rework): the workspace's tabs. Rysunki: sheets, terrain, house; Model: the version (Inspector).
import { useProject } from '../state/store';
import { TABS, useUi } from '../state/ui';
import { HousePanel } from './HousePanel';
import { SheetList } from './SheetList';
import { t } from './strings';
import { TerrainPanel } from './TerrainPanel';
import { VersionPanel } from './VersionPanel';

export function Panel() {
  const workspace = useUi((s) => s.workspace);
  const saved = useUi((s) => s.tab[s.workspace]);
  const setTab = useUi((s) => s.setTab);
  const name = useProject((s) => s.dir?.name);
  const sheetCount = useProject((s) => s.sheets.filter((r) => !r.missing).length);
  const tabs = TABS[workspace];
  const tab = tabs.includes(saved) ? saved : tabs[0]!;
  return (
    <aside className="panel">
      <div className="tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t.shell.tabs[k]}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {!name ? (
          <p className="muted">{t.noProject}</p>
        ) : tab === 'sheets' ? (
          <>
            <h2>
              {name} <span className="muted">({t.fileCount(sheetCount)})</span>
            </h2>
            {sheetCount === 0 && <p>{t.folderEmpty}</p>}
            <SheetList />
          </>
        ) : tab === 'terrain' ? (
          <TerrainPanel />
        ) : tab === 'house' ? (
          <HousePanel />
        ) : (
          <VersionPanel />
        )}
      </div>
    </aside>
  );
}
