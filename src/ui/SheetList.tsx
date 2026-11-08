import { useState } from 'react';
import { levelPoint } from '../dwg/labels';
import type { NormalizedSheet, SheetLabels } from '../dwg/types';
import { SHEET_KINDS, type SheetKind } from '../project/projectFile';
import { useProject, type PdfState, type SheetRow } from '../state/store';
import { planeValue, withPlane } from '../project/vertical';
import { formatHeight } from '../project/levels';
import { useLevelReference, useRefValue } from '../state/levels';
import { deriveSite, unsavedTransforms } from '../state/site';
import { deriveVertical, isVertical, placementFor, unsavedPlacements, useReference, type VerticalKind } from '../state/vertical';
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
    void save({ placements: unsavedPlacements(), transforms: unsavedTransforms() }).finally(() => setSaving(false));
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
      <ReferenceLine />
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
  const pdf = useProject((st) => st.pdfs[s.file]);
  const parse = useProject((st) => st.parse);
  const setKind = useProject((st) => st.setKind);
  const setZ = useProject((st) => st.setZ);
  const refValue = useRefValue();

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
        {s.placement?.type === 'horizontal' && (
          <label>
            z <ZInput value={s.placement.z} onChange={(z) => setZ(s.file, z)} /> m{' '}
            <span className="muted">= {formatHeight(s.placement.z, refValue)}</span>
          </label>
        )}
        {s.source === 'suggested' && <span className="tag suggested">{t.suggested}</span>}
        {s.missing && <span className="error">{t.fileMissing}</span>}
      </div>
      {s.kind === 'pdf' && pdf && <PdfLine pdf={pdf} />}
      {s.kind === 'pdf' && pdf?.status === 'done' && <OpacitySlider file={s.file} />}
      {s.kind === 'pdf' && pdf?.status === 'done' && <AlignLine row={s} />}
      {p?.status === 'parsing' && <div className="muted">{t.parsing}</div>}
      {p?.status === 'error' && <div className="error">{p.message}</div>}
      {p?.status === 'done' && (
        <>
          {isVertical(s.kind) && (
            <AxisFitLine row={s} kind={s.kind} sheet={p.summary.sheet} />
          )}
          {s.kind === 'site' && <AlignLine row={s} sheet={p.summary.sheet} />}
          <LevelsLine labels={p.summary.labels} kind={s.kind} />
          <Summary s={p.summary} />
          <SheetLayers row={s} sheet={p.summary.sheet} />
        </>
      )}
    </li>
  );
}

function AxisFitLine({ row, kind, sheet }: { row: SheetRow; kind: VerticalKind; sheet: NormalizedSheet }) {
  const ref = useReference();
  const setVertical = useProject((st) => st.setVertical);
  const resetVertical = useProject((st) => st.resetVertical);
  if (!ref) return <div className="error">{t.axis.noReference}</div>;
  const derived = deriveVertical(row.file, kind, sheet, ref);
  const { fit, plane } = derived;
  const placement = placementFor(row, derived);
  const edited = row.placement?.type === 'vertical';
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
        <div className={placement ? undefined : 'error'}>
          {t.plane.title}:{' '}
          {placement ? (
            <>
              <label>
                {fit.axis === 'x' ? 'y' : 'x'} ={' '}
                {/* Remount on reset so the field shows the derived value again. */}
                <ZInput
                  key={edited ? 'edited' : 'auto'}
                  value={planeValue(placement)} onChange={(v) => setVertical(row.file, withPlane(placement, v))} /> m
              </label>{' '}
              <span className="muted">
                (
                {edited
                  ? `${t.plane.edited}${plane.ok ? ` · ${t.plane.auto} ${plane.value.toFixed(3)}` : ''}`
                  : plane.ok && (plane.source === 'cut' ? `${t.plane.cut} ${plane.letter}` : t.plane.wall)}
                )
              </span>
              {edited && (
                <>
                  {' '}
                  <button type="button" title={t.plane.resetTitle} onClick={() => resetVertical(row.file)}>
                    {t.plane.reset}
                  </button>
                </>
              )}
            </>
          ) : !plane.ok && (
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

/** Site sheet (with `sheet`): saved transform, else the automatic one. PDF: saved transform, else identity. */
function AlignLine({ row, sheet }: { row: SheetRow; sheet?: NormalizedSheet }) {
  const ref = useReference();
  const resetTransform = useProject((st) => st.resetTransform);
  const startAlign = useProject((st) => st.startAlign);
  const active = useProject((st) => st.align?.file === row.file);
  const pct = (v: number) => `${(v * 100).toFixed(0)} %`;
  // A saved transform wins and is not re-derived (PLAN.md §5 M1c).
  const a = row.transform || !sheet ? undefined : ref && deriveSite(sheet, ref);
  const transform = row.transform ?? (a?.ok ? a.transform : undefined);
  const tools = (
    <>
      {' '}
      <button type="button" title={t.align.startTitle} disabled={active} onClick={() => startAlign(row.file)}>
        {t.align.start}
      </button>
      {row.transform && (
        <>
          {' '}
          <button type="button" title={sheet ? t.align.resetTitle : t.align.resetPdfTitle} onClick={() => resetTransform(row.file)}>
            {t.plane.reset}
          </button>
        </>
      )}
    </>
  );
  if (sheet && !row.transform && !ref) return <div className="error">{t.axis.noReference}</div>;
  if (!transform)
    return (
      <div>
        {t.align.title}:{' '}
        {a && !a.ok ? (
          <span className="error">
            {t.align.reasons[a.reason]}
            {a.share !== undefined && ` (${pct(a.share)})`}
          </span>
        ) : (
          <span className="muted">{t.align.identity}</span>
        )}
        {tools}
      </div>
    );
  const { scale, rotation, translate } = transform;
  return (
    <div>
      {t.align.title}: {t.align.rotation} <strong>{((rotation * 180) / Math.PI).toFixed(3)}°</strong> · {t.align.scale}{' '}
      <strong>{scale.toFixed(3)}</strong> · {t.align.translation}{' '}
      <strong>
        ({translate.x.toFixed(3)}, {translate.y.toFixed(3)}) m
      </strong>{' '}
      <span className="muted">
        ({a?.ok ? `${t.align.auto} · ${t.align.share} ${pct(a.share)} = ${a.matched}/${a.total} · ${ref?.file}` : t.align.saved})
      </span>
      {tools}
    </div>
  );
}

/** `±0.00 = 355.40 m n.p.m. (4 arkusze)`, or why heights are relative only. */
function ReferenceLine() {
  const r = useLevelReference();
  if (r.ok)
    return (
      <div className="save-bar">
        ±0.00 = <strong>{r.value.toFixed(2)} m n.p.m.</strong> <span className="muted">({t.reference.sheets(r.sheets)})</span>
      </div>
    );
  return (
    <div className="save-bar error">
      {r.reason === 'none'
        ? t.reference.none
        : `${t.reference.disagree}: ${r.values.map((v) => `${v.file} ${v.value.toFixed(2)}`).join(', ')}`}
    </div>
  );
}

/** `Rzędne: 7/8 z punktem`, plus the labels without a point (PLAN.md §5 M2). Hidden when the sheet has none. */
function LevelsLine({ labels, kind }: { labels: SheetLabels; kind: SheetKind }) {
  const { levels, references } = labels;
  if (levels.length === 0 && references.length === 0) return null;
  const missing = levels.filter((l) => !levelPoint(l, kind));
  return (
    <div>
      {t.levels.title}: <strong>{levels.length - missing.length}/{levels.length}</strong> {t.levels.withPoint}
      {references.length > 0 && <span className="muted"> · ±0.00 = {references.map((r) => r.toFixed(2)).join(', ')}</span>}
      {missing.length > 0 && (
        <span className="error">
          {' '}
          · {t.levels.without}: {missing.map((l) => l.text).join(', ')}
        </span>
      )}
    </div>
  );
}

function PdfLine({ pdf }: { pdf: PdfState }) {
  if (pdf.status === 'rendering') return <div className="muted">{t.pdf.rendering}</div>;
  if (pdf.status === 'error') return <div className="error">{pdf.message}</div>;
  const { canvas, pagePt, sheetM, dpi, clamped, ms } = pdf.render;
  return (
    <div>
      {t.pdf.title}:{' '}
      <strong>
        {canvas.width} × {canvas.height} px
      </strong>{' '}
      · {dpi.toFixed(0)} dpi{clamped && <span className="error"> ({t.pdf.clamped})</span>} · {ms} ms{' '}
      <span className="muted">
        ({t.pdf.page} {pagePt.w.toFixed(0)} × {pagePt.h.toFixed(0)} pt · {t.pdf.sheet} {sheetM.w.toFixed(1)} × {sheetM.h.toFixed(1)} m)
      </span>
    </div>
  );
}

function OpacitySlider({ file }: { file: string }) {
  const opacity = useProject((st) => st.pdfOpacity[file] ?? 1);
  const setPdfOpacity = useProject((st) => st.setPdfOpacity);
  return (
    <div>
      <label>
        {t.pdf.opacity}{' '}
        <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => setPdfOpacity(file, Number(e.target.value) / 100)} />{' '}
        {Math.round(opacity * 100)} %
      </label>
    </div>
  );
}

const parseNum = (text: string) => {
  const v = text.trim().replace(',', '.');
  return v === '' ? NaN : Number(v);
};

/** Shown to the mm, so derived values don't print float noise. */
const fmt = (v: number) => String(Number(v.toFixed(3)));

/** Accepts a decimal comma or dot. Invalid text (not a number, or failing `accept`) is shown in red and not committed. */
export function ZInput({ value, onChange, accept = () => true }: { value: number; onChange: (z: number) => void; accept?: (v: number) => boolean }) {
  const [text, setText] = useState(() => fmt(value));
  const ok = (v: number) => Number.isFinite(v) && accept(v);
  const valid = ok(parseNum(text));
  return (
    <input
      className={`z-input${valid ? '' : ' invalid'}`}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const z = parseNum(e.target.value);
        if (ok(z)) onChange(z);
      }}
      onBlur={() => valid && setText(fmt(value))}
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
