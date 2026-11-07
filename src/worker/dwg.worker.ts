/// <reference lib="webworker" />
// The ONLY module allowed to import libredwg-web (GPL-3.0, PLAN.md §2). Enforced by ESLint.
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import type { ParseRequest, ParseResponse, ParseSummary } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let libPromise: ReturnType<typeof LibreDwg.create> | undefined;
// WASM is served from public/wasm/ (copied by scripts/copy-wasm.mjs).
const getLib = () => (libPromise ??= LibreDwg.create(`${import.meta.env.BASE_URL}wasm`));

async function parse({ name, bytes }: ParseRequest): Promise<ParseSummary> {
  const lib = await getLib();
  const t0 = performance.now();
  const dwg = lib.dwg_read_data(bytes, Dwg_File_Type.DWG);
  if (dwg == null) throw new Error(`libredwg could not read ${name}`);
  try {
    const db = lib.convert(dwg);
    const entityCounts: Record<string, number> = {};
    const layers = new Set(db.tables.LAYER.entries.map((l) => l.name));
    for (const e of db.entities) {
      entityCounts[e.type] = (entityCounts[e.type] ?? 0) + 1;
      layers.add(e.layer);
    }
    return {
      name,
      insunits: db.header.INSUNITS,
      entityCount: db.entities.length,
      entityCounts,
      layerNames: [...layers].sort((a, b) => a.localeCompare(b, 'pl')),
      ms: Math.round(performance.now() - t0),
    };
  } finally {
    lib.dwg_free(dwg);
  }
}

self.onmessage = async (ev: MessageEvent<ParseRequest>) => {
  const { id } = ev.data;
  let res: ParseResponse;
  try {
    res = { id, ok: true, summary: await parse(ev.data) };
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(res);
};
