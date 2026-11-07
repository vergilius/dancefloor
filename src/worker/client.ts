// Main-thread side of the DWG worker: one shared worker, promise per request.
import type { ParseResponse, ParseSummary } from './protocol';

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (s: ParseSummary) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./dwg.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<ParseResponse>) => {
    const res = ev.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.summary);
    else p.reject(new Error(res.error));
  };
  // A crash (e.g. WASM failed to load) rejects everything in flight; the next call starts a fresh worker.
  w.onerror = (ev) => {
    ev.preventDefault();
    for (const p of pending.values()) p.reject(new Error(ev.message || 'DWG worker crashed'));
    pending.clear();
    w.terminate();
    worker = undefined;
  };
  return (worker = w);
}

/** Parses a DWG in the worker. The buffer is transferred (unusable afterwards). */
export function parseDwg(name: string, bytes: ArrayBuffer): Promise<ParseSummary> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, name, bytes }, [bytes]);
  });
}
