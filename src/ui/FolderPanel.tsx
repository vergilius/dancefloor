import { useEffect, useState } from 'react';
import {
  ensurePermission,
  isFolderAccessSupported,
  listSourceFiles,
  loadRememberedFolder,
  pickFolder,
  type SourceFile,
} from '../project/folder';
import { t } from './strings';

type State =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'needsPermission'; dir: FileSystemDirectoryHandle }
  | { status: 'ready'; dir: FileSystemDirectoryHandle; files: SourceFile[] }
  | { status: 'error'; message: string };

export function FolderPanel() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const open = async (dir: FileSystemDirectoryHandle) =>
    setState({ status: 'ready', dir, files: await listSourceFiles(dir) });

  const run = (action: () => Promise<void>) => () => {
    action().catch((err: unknown) => setState({ status: 'error', message: String(err) }));
  };

  useEffect(() => {
    if (!isFolderAccessSupported()) return;
    let cancelled = false;
    (async () => {
      const dir = await loadRememberedFolder();
      if (cancelled) return;
      if (!dir) return setState({ status: 'none' });
      if (await ensurePermission(dir, false)) await open(dir);
      else setState({ status: 'needsPermission', dir });
    })().catch((err: unknown) => setState({ status: 'error', message: String(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isFolderAccessSupported()) return <p className="error">{t.folderUnsupported}</p>;

  const pick = run(async () => {
    const dir = await pickFolder();
    if (dir) await open(dir);
  });

  return (
    <section className="panel">
      <button type="button" onClick={pick}>
        {state.status === 'ready' ? t.folderChange : t.folderOpen}
      </button>

      {state.status === 'loading' && <p>{t.loading}</p>}
      {state.status === 'none' && <p>{t.noProject}</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}

      {state.status === 'needsPermission' && (
        <p>
          {t.folderRemembered} <strong>{state.dir.name}</strong>
          <br />
          <button
            type="button"
            onClick={run(async () => {
              if (await ensurePermission(state.dir, true)) await open(state.dir);
            })}
          >
            {t.folderRestore}
          </button>
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <h2>
            {state.dir.name} <span className="muted">({t.fileCount(state.files.length)})</span>
          </h2>
          {state.files.length === 0 ? (
            <p>{t.folderEmpty}</p>
          ) : (
            <ul className="file-list">
              {state.files.map((f) => (
                <li key={f.name}>
                  <span className="tag">{f.type.toUpperCase()}</span> {f.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
