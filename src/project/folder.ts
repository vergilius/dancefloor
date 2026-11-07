// Project folder access (PLAN.md §2 "File access"): pick a folder, remember its handle in IndexedDB,
// restore it after one permission click, list the source sheets in it.

export type SourceFile = { name: string; type: 'dwg' | 'pdf' };

// readwrite now, so saving dancefloor.json later (T7) doesn't need a second prompt.
const PERMISSION: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
const DB_NAME = 'dancefloor';
const STORE = 'handles';
const KEY = 'projectDir';

export const isFolderAccessSupported = () => typeof window.showDirectoryPicker === 'function';

function withStore<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.transaction?.addEventListener('complete', () => db.close());
    };
  });
}

/** Opens the picker and remembers the chosen folder. Returns undefined if the user cancels. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  if (!window.showDirectoryPicker) throw new Error('File System Access API not supported');
  try {
    const dir = await window.showDirectoryPicker({ id: 'dancefloor-project', mode: PERMISSION.mode });
    await withStore('readwrite', (s) => s.put(dir, KEY));
    return dir;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return undefined;
    throw err;
  }
}

export async function loadRememberedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  return withStore<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY));
}

/** True if access is granted. With `request`, asks the user (must be called from a click). */
export async function ensurePermission(dir: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  if ((await dir.queryPermission(PERMISSION)) === 'granted') return true;
  if (!request) return false;
  return (await dir.requestPermission(PERMISSION)) === 'granted';
}

export function sourceFileType(name: string): SourceFile['type'] | undefined {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'dwg' || ext === 'pdf' ? ext : undefined;
}

/** DWG and PDF files directly in the folder (not recursive), sorted by name. */
export async function listSourceFiles(dir: FileSystemDirectoryHandle): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue;
    const type = sourceFileType(entry.name);
    if (type) files.push({ name: entry.name, type });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true }));
}
