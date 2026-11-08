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

/** Edit versions live in this subfolder of the project folder (PLAN.md §5 M4a). */
export const VERSIONS_DIR = 'dancefloor-versions';

const isNotFound = (err: unknown) => err instanceof DOMException && err.name === 'NotFoundError';

/** The versions subfolder; undefined if it doesn't exist and `create` is false. */
export async function versionsDir(dir: FileSystemDirectoryHandle, create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await dir.getDirectoryHandle(VERSIONS_DIR, { create });
  } catch (err) {
    if (!create && isNotFound(err)) return undefined;
    throw err;
  }
}

/** Names of the files directly in `dir` ending in `ext`, sorted. */
export async function listFiles(dir: FileSystemDirectoryHandle, ext: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of dir.values()) if (entry.kind === 'file' && entry.name.endsWith(ext)) out.push(entry.name);
  return out.sort();
}

/** Writes the whole file; on failure the previous file is kept (the write is aborted, not committed). */
export async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: string | ArrayBuffer): Promise<void> {
  const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
  try {
    await out.write(data);
  } catch (err) {
    await out.abort();
    throw err;
  }
  await out.close();
}

export async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<File> {
  return (await dir.getFileHandle(name)).getFile();
}

/** Removes a file; a file that is already gone is fine. */
export async function removeFile(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}
