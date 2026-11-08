// Top header (UI rework): project folder, workspace and viewport layout switches, the terrain version picker with
// Nowa / Zmień nazwę / Usuń, undo / redo, save, Prezentacja and the panel toggle.
import { useEffect, useState } from 'react';
import { FolderOpen, PanelRight, Pencil, Plus, Presentation, Redo2, Save, Trash, Undo2 } from 'lucide-react';
import { ensurePermission, isFolderAccessSupported, loadRememberedFolder, pickFolder } from '../project/folder';
import { unsavedTransforms } from '../state/site';
import { useProject } from '../state/store';
import { useUi, type Layout, type Workspace } from '../state/ui';
import { unsavedPlacements } from '../state/vertical';
import { useActiveVersion, useEnvSurface, useVersions } from '../state/versions';
import { enterClean } from './shortcuts';
import { t } from './strings';

type Folder =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'needsPermission'; dir: FileSystemDirectoryHandle }
  | { status: 'ready' }
  | { status: 'error'; message: string };

const WORKSPACES: Workspace[] = ['drawings', 'model'];
const LAYOUTS: Layout[] = ['design', 'both', 'env'];

async function openFolder(dir: FileSystemDirectoryHandle) {
  await useProject.getState().open(dir);
  await useVersions.getState().load(dir);
  useUi.getState().restore(dir.name, useVersions.getState().versions.length > 0);
}

export function Header() {
  const [folder, setFolder] = useState<Folder>(() => (isFolderAccessSupported() ? { status: 'loading' } : { status: 'error', message: t.folderUnsupported }));
  const name = useProject((s) => s.dir?.name);
  const { workspace, layout, panelOpen, setWorkspace, setLayout, togglePanel } = useUi();

  const run = (action: () => Promise<void>) => () => {
    action().catch((err: unknown) => setFolder({ status: 'error', message: String(err) }));
  };

  useEffect(() => {
    if (!isFolderAccessSupported()) return;
    let cancelled = false;
    (async () => {
      const dir = await loadRememberedFolder();
      if (cancelled) return;
      if (!dir) return setFolder({ status: 'none' });
      if (await ensurePermission(dir, false)) {
        await openFolder(dir);
        setFolder({ status: 'ready' });
      } else setFolder({ status: 'needsPermission', dir });
    })().catch((err: unknown) => setFolder({ status: 'error', message: String(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = run(async () => {
    const dir = await pickFolder();
    if (!dir) return;
    await openFolder(dir);
    setFolder({ status: 'ready' });
  });

  return (
    <header className="header">
      <span className="brand">{t.appTitle}</span>
      <button type="button" className="tb" title={name ? t.folderChange : t.folderOpen} onClick={pick} disabled={!isFolderAccessSupported()}>
        <FolderOpen size={16} /> {name ?? t.folderOpen}
      </button>
      {folder.status === 'needsPermission' && (
        <button
          type="button"
          className="tb accent"
          onClick={run(async () => {
            if (!(await ensurePermission(folder.dir, true))) return;
            await openFolder(folder.dir);
            setFolder({ status: 'ready' });
          })}
        >
          {t.folderRestore}: {folder.dir.name}
        </button>
      )}
      {folder.status === 'loading' && <span className="muted">{t.loading}</span>}
      {folder.status === 'error' && <span className="error">{folder.message}</span>}
      {name && <SaveButton />}

      <span className="sep" />
      <div className="seg" role="group">
        {WORKSPACES.map((w) => (
          <button key={w} type="button" aria-pressed={workspace === w} title={t.shell.workspacesTitle[w]} onClick={() => setWorkspace(w)}>
            {t.shell.workspaces[w]}
          </button>
        ))}
      </div>
      <div className="seg" role="group" title={t.shell.layoutsTitle}>
        {LAYOUTS.map((l) => (
          <button key={l} type="button" aria-pressed={layout === l} onClick={() => setLayout(l)}>
            {t.shell.layouts[l]}
          </button>
        ))}
      </div>

      <span className="spacer" />
      {name && <VersionPicker />}
      <span className="sep" />
      <button type="button" className="tb" title={t.shell.cleanTitle} onClick={enterClean}>
        <Presentation size={16} /> {t.shell.clean}
      </button>
      <button type="button" className="tb icon" aria-pressed={panelOpen} title={t.shell.panelToggle} onClick={togglePanel}>
        <PanelRight size={16} />
      </button>
    </header>
  );
}

function SaveButton() {
  const dirty = useProject((s) => s.dirty);
  const loadError = useProject((s) => s.loadError);
  const save = useProject((s) => s.save);
  const [saving, setSaving] = useState(false);
  const onSave = () => {
    setSaving(true);
    void save({ placements: unsavedPlacements(), transforms: unsavedTransforms() }).finally(() => setSaving(false));
  };
  return (
    <button type="button" className={`tb icon${dirty ? ' dirty' : ''}`} title={`${t.shell.save} · ${dirty ? t.unsaved : t.saved}`} disabled={saving || !!loadError} onClick={onSave}>
      <Save size={16} />
    </button>
  );
}

function VersionPicker() {
  const { live } = useEnvSurface();
  const { versions, active, history, create, rename, remove, setActive, undo, redo } = useVersions();
  const version = useActiveVersion();
  const h = version && history[version.id];
  const onRename = () => {
    if (!version) return;
    const n = window.prompt(t.versions.renamePrompt, version.name);
    if (n?.trim()) void rename(version.id, n);
  };
  const onRemove = () => {
    if (version && window.confirm(t.versions.removeConfirm(version.name))) void remove(version.id);
  };
  return (
    <>
      <label className="version-pick" title={t.versions.label}>
        <span className="muted">{t.versions.label}</span>
        <select value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="preview">{t.versions.preview}</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="tb icon" disabled={!live} title={live ? `${t.versions.create}: ${t.versions.createTitle}` : t.versions.noTerrain} onClick={() => live && void create(live)}>
        <Plus size={16} />
      </button>
      <button type="button" className="tb icon" disabled={!version} title={t.versions.rename} onClick={onRename}>
        <Pencil size={16} />
      </button>
      <button type="button" className="tb icon" disabled={!version} title={t.versions.remove} onClick={onRemove}>
        <Trash size={16} />
      </button>
      <span className="sep" />
      <button type="button" className="tb icon" disabled={!h?.undo.length} title={t.versions.undoTitle} onClick={undo}>
        <Undo2 size={16} />
      </button>
      <button type="button" className="tb icon" disabled={!h?.redo.length} title={t.versions.redoTitle} onClick={redo}>
        <Redo2 size={16} />
      </button>
    </>
  );
}
