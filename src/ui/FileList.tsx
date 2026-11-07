import { useState } from 'react';
import type { SourceFile } from '../project/folder';
import { parseDwg } from '../worker/client';
import type { ParseSummary } from '../worker/protocol';
import { t } from './strings';

type ParseState =
  | { status: 'parsing' }
  | { status: 'done'; summary: ParseSummary }
  | { status: 'error'; message: string };

type Props = { dir: FileSystemDirectoryHandle; files: SourceFile[] };

export function FileList({ dir, files }: Props) {
  const [parsed, setParsed] = useState<Record<string, ParseState>>({});
  const set = (name: string, s: ParseState) => setParsed((prev) => ({ ...prev, [name]: s }));

  const parse = async (name: string) => {
    set(name, { status: 'parsing' });
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      set(name, { status: 'done', summary: await parseDwg(name, await file.arrayBuffer()) });
    } catch (err) {
      set(name, { status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <ul className="file-list">
      {files.map((f) => {
        const p = parsed[f.name];
        return (
          <li key={f.name}>
            {f.type === 'dwg' ? (
              <button type="button" className="link" onClick={() => void parse(f.name)} disabled={p?.status === 'parsing'}>
                <span className="tag">DWG</span> {f.name}
              </button>
            ) : (
              <span>
                <span className="tag">PDF</span> {f.name}
              </span>
            )}
            {p?.status === 'parsing' && <div className="muted">{t.parsing}</div>}
            {p?.status === 'error' && <div className="error">{p.message}</div>}
            {p?.status === 'done' && <Summary s={p.summary} />}
          </li>
        );
      })}
    </ul>
  );
}

function Summary({ s }: { s: ParseSummary }) {
  const types = Object.entries(s.entityCounts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="summary">
      <div>
        {t.entities}: <strong>{s.entityCount}</strong> · INSUNITS {s.insunits ?? '?'}
        {s.insunits !== 4 && <span className="error"> ({t.notMm})</span>} · {s.ms} ms
      </div>
      <div className="muted">{types.map(([k, v]) => `${k} ${v}`).join(', ')}</div>
      <div className="muted">
        {t.layers} ({s.layerNames.length}): {s.layerNames.join(', ')}
      </div>
    </div>
  );
}
