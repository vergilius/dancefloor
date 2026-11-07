import { useMemo, useState } from 'react';
import type { NormalizedSheet } from '../dwg/types';
import { SHEET_KINDS, type SheetKind } from '../project/projectFile';
import { fitAxis, planeOf, planGrid, type PlanGrid } from '../project/vertical';
import { useProject, type SheetRow } from '../state/store';
import type { ParseSummary } from '../worker/protocol';
import { GroupToggles, SheetLayers } from './LayerPanel';
import { t } from './strings';

export function SheetList() {
  const sheets = useProject((s) => s.sheets);
  const dirty = useProject((s) => s.dirty);
  const loadError = useProject((s) => s.loadError);
  const saveError = useProject((s) => s.saveError);
  const save = useProject((s) => s.save);
  const parsed = useProject((s) => s.parsed);
  const parse = useProject((s) => s.parse);
  const [saving, setSaving] = useState(false);

  const onSave = () => {
    setSaving(true);
    void save().finally(() => setSaving(false));
  };
  // The worker queues files one at a time and times each parse itself, so queueing doesn't skew `ms`.
  const onParseAll = () => {
    for (const s of sheets) if (s.type === 'dwg' && !s.missing && !parsed[s.file]) void parse(s.file);
  };
  const done = Object.entries(parsed).flatMap(([file, p]) => (p.status === 'done' ? [{ file, ms: p.summary.ms }] : []));
  const slowest = done.reduce<(typeof done)[number] | undefined>((a, b) => (!a || b.ms > a.ms ? b : a), undefined);

  return (
    <>
      <div className="save-bar">
        <button type="button" onClick={onSave} disabled={saving || !!loadError}>
          {t.save}
        </button>{' '}
        <span className={dirty ? 'error' : 'muted'}>{dirty ? t.unsaved : t.saved}</span>
      </div>
      <div className="save-bar">
        <button type="button" onClick={onParseAll}>
          {t.parseAll}
        </button>{' '}
        {slowest && (
          <span className={slowest.ms < 2000 ? 'muted' : 'error'}>
            {done.length} · {t.slowest}: {slowest.file} {slowest.ms} ms
          </span>
        )}
      </div>
      {loadError && (
        <p className="error">
          {t.loadError}: {loadError}
        </p>
      )}
      {saveError && (
        <p className="error">
          {t.saveError}: {saveError}
        </p>
      )}
      <GroupToggles />
      <ul className="file-list">
        {sheets.map((s) => (
          <SheetItem key={s.file} sheet={s} />
        ))}
      </ul>
    </>
  );
}

function SheetItem({ sheet: s }: { sheet: SheetRow }) {
  const p = useProject((st) => st.parsed[s.file]);
  const parse = useProject((st) => st.parse);
  const setKind = useProject((st) => st.setKind);
  const setZ = useProject((st) => st.setZ);

  return (
    <li>
      {s.type === 'dwg' ? (
        <button type="button" className="link" onClick={() => void parse(s.file)} disabled={p?.status === 'parsing'}>
          <span className="tag">DWG</span> {s.file}
        </button>
      ) : (
        <span>
          <span className="tag">{s.type === 'pdf' ? 'PDF' : '?'}</span> {s.file}
        </span>
      )}
      <div className="sheet-controls">
        <select value={s.kind} onChange={(e) => setKind(s.file, e.target.value as SheetKind)}>
          {SHEET_KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </select>
        {s.placement && (
          <label>
            z <ZInput value={s.placement.z} onChange={(z) => setZ(s.file, z)} /> m
          </label>
        )}
        {s.source === 'suggested' && <span className="tag suggested">{t.suggested}</span>}
        {s.missing && <span className="error">{t.fileMissing}</span>}
      </div>
      {p?.status === 'parsing' && <div className="muted">{t.parsing}</div>}
      {p?.status === 'error' && <div className="error">{p.message}</div>}
      {p?.status === 'done' && (
        <>
          {(s.kind === 'elevation' || s.kind === 'section') && (
            <AxisFitLine file={s.file} kind={s.kind} sheet={p.summary.sheet} />
          )}
          <Summary s={p.summary} />
          <SheetLayers row={s} sheet={p.summary.sheet} />
        </>
      )}
    </li>
  );
}

/** The reference plan's grid: the first parsed plan at z = 0 (PLAN.md §5 M1b). */
function useReferenceGrid(): { file: string; plan: NormalizedSheet; grid: PlanGrid } | undefined {
  const ref = useProject((st) => {
    const row = st.sheets.find((r) => r.kind === 'plan' && r.placement?.z === 0);
    const p = row && st.parsed[row.file];
    return p?.status === 'done' ? p.summary : undefined;
  });
  return useMemo(() => ref && { file: ref.name, plan: ref.sheet, grid: planGrid(ref.sheet) }, [ref]);
}

function AxisFitLine({ file, kind, sheet }: { file: string; kind: 'elevation' | 'section'; sheet: NormalizedSheet }) {
  const ref = useReferenceGrid();
  const fit = useMemo(() => ref && fitAxis(sheet, ref.grid), [ref, sheet]);
  const plane = useMemo(() => ref && fit?.ok && planeOf(file, kind, ref.plan, fit), [ref, fit, file, kind]);
  if (!ref || !fit) return <div className="error">{t.axis.noReference}</div>;
  const mm = (v: number) => (v * 1000).toFixed(2);
  if (!fit.ok)
    return (
      <div className="error">
        {t.axis.title}: {fit.matched}/{fit.labels} · {t.axis.reasons[fit.reason]}
        {fit.residual !== undefined && ` (${mm(fit.residual)} mm)`}
      </div>
    );
  return (
    <div>
      {t.axis.title}: <strong>{fit.matched}/{fit.labels}</strong> · {t.axis.residual} <strong>{mm(fit.residual)} mm</strong> ·{' '}
      {t.axis.looks} <strong>{t.axis.look[fit.look]}</strong>{' '}
      <span className="muted">
        (x = {fit.sign < 0 ? '−' : ''}plan {fit.axis} {fit.offset < 0 ? '−' : '+'} {Math.abs(fit.offset).toFixed(3)} · {ref.file})
      </span>
      {plane && (
        <div className={plane.ok ? undefined : 'error'}>
          {t.plane.title}:{' '}
          {plane.ok ? (
            <>
              <strong>
                {fit.axis === 'x' ? 'y' : 'x'} = {plane.value.toFixed(3)} m
              </strong>{' '}
              <span className="muted">
                ({plane.source === 'cut' ? `${t.plane.cut} ${plane.letter}` : t.plane.wall})
              </span>
            </>
          ) : (
            <>
              {t.plane.reasons[plane.reason]}
              {plane.letter && ` (${plane.letter})`}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const parseNum = (text: string) => {
  const v = text.trim().replace(',', '.');
  return v === '' ? NaN : Number(v);
};

/** Accepts a decimal comma or dot. Invalid text is shown in red and not committed. */
function ZInput({ value, onChange }: { value: number; onChange: (z: number) => void }) {
  const [text, setText] = useState(() => String(value));
  const valid = Number.isFinite(parseNum(text));
  return (
    <input
      className={`z-input${valid ? '' : ' invalid'}`}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const z = parseNum(e.target.value);
        if (Number.isFinite(z)) onChange(z);
      }}
      onBlur={() => valid && setText(String(value))}
    />
  );
}

const counts = (r: Record<string, number>) =>
  Object.entries(r)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || '—';
const m = (v: number) => v.toFixed(2);

function Summary({ s }: { s: ParseSummary }) {
  const types = Object.entries(s.entityCounts).sort((a, b) => b[1] - a[1]);
  const { extents: x, drawn, skipped, segmentCount, texts, textLeftovers } = s.sheet;
  return (
    <div className="summary">
      <div>
        {t.entities}: <strong>{s.entityCount}</strong> · INSUNITS {s.insunits ?? '?'}
        {s.insunits !== 4 && <span className="error"> ({t.notMm})</span>} · {s.ms} ms
      </div>
      <div className="muted">{types.map(([k, v]) => `${k} ${v}`).join(', ')}</div>
      <div>
        {t.extents}:{' '}
        <strong>
          {x ? `x ${m(x.minX)}…${m(x.maxX)} m · y ${m(x.minY)}…${m(x.maxY)} m` : t.noGeometry}
        </strong>
      </div>
      <div className="muted">
        {t.drawn} ({segmentCount} {t.segments}): {counts(drawn)}
      </div>
      <div className="muted">
        {t.skipped}: {counts(skipped)}
      </div>
      <div className="muted">
        {t.texts} ({texts.length}
        {textLeftovers > 0 && <span className="error">, {textLeftovers} {t.textLeftovers}</span>}):{' '}
        {[...new Set(texts.map((x) => x.text))].slice(0, 12).join(' · ')}
      </div>
    </div>
  );
}
