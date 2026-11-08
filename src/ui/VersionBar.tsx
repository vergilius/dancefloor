// Environment view bar (PLAN.md §5 M4a): Podgląd or an edit version, plus Nowa wersja / Zmień nazwę / Usuń.
import { useActiveVersion, useEnvSurface, useVersions } from '../state/versions';
import { rectSize } from '../versions/edits';
import { t } from './strings';

export function VersionBar() {
  const { live } = useEnvSurface();
  const { versions, broken, active, saveError, unsaved, tool, draft, create, rename, remove, setActive, setTool } = useVersions();
  const version = useActiveVersion();

  const onRename = () => {
    if (!version) return;
    const name = window.prompt(t.versions.renamePrompt, version.name);
    if (name?.trim()) void rename(version.id, name);
  };
  const onRemove = () => {
    if (version && window.confirm(t.versions.removeConfirm(version.name))) void remove(version.id);
  };

  return (
    <div className="env-bar">
      <label>
        <span className="muted">{t.versions.label}</span>{' '}
        <select value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="preview">{t.versions.preview}</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!live} title={live ? t.versions.createTitle : t.versions.noTerrain} onClick={() => live && void create(live)}>
        {t.versions.create}
      </button>
      <button type="button" disabled={!version} onClick={onRename}>
        {t.versions.rename}
      </button>
      <button type="button" disabled={!version} onClick={onRemove}>
        {t.versions.remove}
      </button>
      {version && (
        <button type="button" aria-pressed={tool === 'level'} title={t.versions.toolTitles.level} onClick={() => setTool(tool === 'level' ? undefined : 'level')}>
          {t.versions.tools.level}
        </button>
      )}
      {draft ? (
        <span className="status">
          <strong>{t.versions.rectSize(rectSize(draft).w, rectSize(draft).h, rectSize(draft).area)}</strong>
        </span>
      ) : (
        tool && <span className="status muted">{t.versions.dragHint}</span>
      )}
      <span className="status">
        {version ? (
          <>
            <strong>{version.name}</strong> · {t.versions.status(version.grid.cols, version.grid.rows, version.edits.length)}
            {!saveError && <> · {unsaved.includes(version.id) ? t.versions.unsaved : t.versions.saved}</>}
          </>
        ) : (
          <span className="muted">{t.versions.previewNote}</span>
        )}
      </span>
      {saveError && (
        <span className="status error">
          {t.versions.saveError}: {saveError}
        </span>
      )}
      {broken.length > 0 && (
        <span className="status error" title={broken.map((b) => `${b.file || '—'}: ${b.error}`).join('\n')}>
          {t.versions.broken(broken.length)}
        </span>
      )}
    </div>
  );
}
