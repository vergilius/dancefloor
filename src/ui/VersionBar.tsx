// Environment view bar (PLAN.md §5 M4a): Podgląd or an edit version, plus Nowa wersja / Zmień nazwę / Usuń.
import { useEffect } from 'react';
import { CUT_COLOR, DIFF_SATURATION, FILL_COLOR } from '../scene/TerrainMesh';
import { useActiveVersion, useEnvSurface, useVersions } from '../state/versions';
import { rectSize, TOOLS } from '../versions/edits';
import { t } from './strings';

export function VersionBar() {
  const { live } = useEnvSurface();
  const { versions, broken, active, saveError, unsaved, tool, draft, history, showDiff, create, rename, remove, setActive, setTool, undo, redo, setShowDiff } =
    useVersions();
  const version = useActiveVersion();

  const h = version && history[version.id];

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (and Ctrl+Y). Not while typing in a field: there the field's own undo applies.
  useEffect(() => {
    if (!version) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [version, undo, redo]);

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
      {version &&
        TOOLS.map((k) => (
          <button key={k} type="button" aria-pressed={tool === k} title={t.versions.toolTitles[k]} onClick={() => setTool(tool === k ? undefined : k)}>
            {t.versions.tools[k]}
          </button>
        ))}
      {version && (
        <>
          <button type="button" disabled={!h?.undo.length} title={t.versions.undoTitle} onClick={undo}>
            {t.versions.undo}
          </button>
          <button type="button" disabled={!h?.redo.length} title={t.versions.redoTitle} onClick={redo}>
            {t.versions.redo}
          </button>
          <button type="button" aria-pressed={showDiff} title={t.versions.diffTitle} onClick={() => setShowDiff(!showDiff)}>
            {t.versions.diff}
          </button>
          {showDiff && (
            <span className="status diff-legend">
              {t.versions.diffCut} −{DIFF_SATURATION.toFixed(1)} m
              <span className="diff-ramp" style={{ background: `linear-gradient(to right, ${CUT_COLOR}, #fff, ${FILL_COLOR})` }} />+
              {DIFF_SATURATION.toFixed(1)} m {t.versions.diffFill}
            </span>
          )}
        </>
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
