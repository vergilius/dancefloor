// House panel (PLAN.md §5 M5): "Z rzutu dachu", "Dodaj blok" and one entry per block (derived values shown so the
// browser check can compare them with the drawings; rename, heights, re-draw, delete).
import { useMemo, useState } from 'react';
import { hasRoofLayer, isValidBlock, mainBodyFromRoof, polygonArea, wallFace, type Block, type MainBody } from '../house/blocks';
import { formatHeight, formatRel } from '../project/levels';
import { useDrawnSheets } from '../state/drawn';
import { useRefValue } from '../state/levels';
import { useProject } from '../state/store';
import { t } from './strings';

const sheetName = (file: string) => file.replace(/\.dwg$/i, '').split(' - ')[0]!;
const LEVELS_LIST = 'house-levels';

export function HousePanel() {
  const blocks = useProject((s) => s.house.blocks);
  const putBlock = useProject((s) => s.putBlock);
  const drawing = useProject((s) => s.houseDraw !== undefined);
  const startHouseDraw = useProject((s) => s.startHouseDraw);
  const cancelHouseDraw = useProject((s) => s.cancelHouseDraw);
  const ref = useRefValue();
  const drawn = useDrawnSheets();
  const roof = useMemo(() => drawn.find((d) => d.kind === 'plan' && d.placement.type === 'horizontal' && hasRoofLayer(d.sheet)), [drawn]);
  const [last, setLast] = useState<(MainBody & { file: string }) | undefined>();

  const build = () => {
    if (!roof || roof.placement.type !== 'horizontal') return;
    const body = mainBodyFromRoof(roof.sheet, roof.placement.z, t.house.mainBodyName);
    if (!body) return;
    putBlock(body.block);
    setLast({ ...body, file: roof.file });
  };

  return (
    <>
      <h2>{t.house.title}</h2>
      <p>
        <button type="button" disabled={!roof} title={t.house.fromRoofTitle} onClick={build}>
          {t.house.fromRoof}
        </button>{' '}
        {drawing ? (
          <button type="button" onClick={cancelHouseDraw}>
            {t.house.cancelDraw}
          </button>
        ) : (
          <button type="button" title={t.house.addBlockTitle} onClick={() => startHouseDraw()}>
            {t.house.addBlock}
          </button>
        )}
        {!roof && <span className="muted"> {t.house.noRoofSheet}</span>}
      </p>
      {last && (
        <p className="muted">
          {t.house.fromSheet(sheetName(last.file), formatRel(last.block.ridge))}
          {!last.pitchFound && (
            <>
              <br />
              <span className="error">{t.house.pitchFallback(last.pitchLabels.map((v) => `${v}°`).join(', '))}</span>
            </>
          )}
          {!last.outlineFound && (
            <>
              <br />
              <span className="error">{t.house.noOutline}</span>
            </>
          )}
        </p>
      )}
      <LevelOptions />
      {blocks.length === 0 ? (
        <p className="muted">{t.house.none}</p>
      ) : (
        <ul className="house-blocks">
          {blocks.map((b, i) => (
            <li key={`${i}:${b.name}`}>
              <BlockEntry index={i} block={b} refValue={ref} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Height suggestions: level labels (M2) and the plans' z, relative, to the cm. */
function LevelOptions() {
  const parsed = useProject((s) => s.parsed);
  const sheets = useProject((s) => s.sheets);
  const ref = useRefValue();
  const values = useMemo(() => {
    const out = new Set<string>();
    for (const s of sheets) if (s.kind === 'plan' && s.placement?.type === 'horizontal') out.add(s.placement.z.toFixed(2));
    if (ref !== undefined)
      for (const p of Object.values(parsed)) if (p.status === 'done') for (const l of p.summary.labels.levels) out.add((l.value - ref).toFixed(2));
    return [...out].map(Number).sort((a, b) => a - b);
  }, [parsed, sheets, ref]);
  return (
    <datalist id={LEVELS_LIST}>
      {values.map((v) => (
        <option key={v} value={v.toFixed(2)}>
          {formatHeight(v, ref)}
        </option>
      ))}
    </datalist>
  );
}

function BlockEntry({ index, block: b, refValue }: { index: number; block: Block; refValue: number | undefined }) {
  const updateBlock = useProject((s) => s.updateBlock);
  const removeBlock = useProject((s) => s.removeBlock);
  const startHouseDraw = useProject((s) => s.startHouseDraw);
  const redrawing = useProject((s) => s.houseDraw?.redraw === index);
  const [error, setError] = useState<string>();
  const h = (v: number) => formatHeight(v, refValue);

  const change = (next: Block) => {
    if (!isValidBlock(next)) return setError(t.house.heightInvalid);
    if (!updateBlock(index, next)) return setError(t.house.nameTaken(next.name));
    setError(undefined);
  };
  const rename = () => {
    const name = window.prompt(t.house.renamePrompt, b.name)?.trim();
    if (name && name !== b.name) change({ ...b, name });
  };
  const remove = () => {
    if (window.confirm(t.house.removeConfirm(b.name))) removeBlock(index);
  };
  const height = (label: string, value: number, set: (v: number) => Block, shown = h(value)) => (
    <div className="house-height">
      {label} <HeightInput value={value} onCommit={(v) => change(set(v))} /> <span className="muted">{shown}</span>
    </div>
  );

  return (
    <>
      <strong>{b.name}</strong> <span className="muted">({t.house.kinds[b.kind]})</span>
      <br />
      {b.kind === 'gable' ? (
        <>
          {t.house.size(b.x1 - b.x0, b.y1 - b.y0)} · {t.house.pitch(b.pitch)} · {t.house.overhang(b.overhang)}
          {height(t.house.ridge, b.ridge, (ridge) => ({ ...b, ridge }))}
          <div>
            {t.house.wallFace} {h(wallFace(b))}
          </div>
          {height(t.house.bottom, b.bottom, (bottom) => ({ ...b, bottom }))}
        </>
      ) : (
        <>
          {t.house.area(polygonArea(b.polygon))} · {t.house.corners(b.polygon.length)}
          {height(t.house.top, b.top, (top) => ({ ...b, top }))}
          {height(t.house.bottom, b.bottom, (bottom) => ({ ...b, bottom }))}
        </>
      )}
      {error && <div className="error">{error}</div>}
      <div className="house-actions">
        <button type="button" onClick={rename}>
          {t.house.rename}
        </button>
        {b.kind === 'flat' && (
          <button type="button" aria-pressed={redrawing} title={t.house.redrawTitle} onClick={() => startHouseDraw(index)}>
            {t.house.redraw}
          </button>
        )}
        <button type="button" onClick={remove}>
          {t.house.remove}
        </button>
      </div>
    </>
  );
}

/** A relative height in m; typed with a dot or comma (and − or -), committed on Enter or blur. */
function HeightInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const shown = String(Number(value.toFixed(3)));
  // Only while typing; otherwise the stored value is shown.
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    const text = (draft ?? '').trim();
    const v = Number(text.replace(',', '.').replace('−', '-').replace(/^\+/, ''));
    if (text !== '' && Number.isFinite(v) && v !== value) onCommit(v);
    setDraft(undefined);
  };
  return (
    <input
      className="height-input"
      list={LEVELS_LIST}
      title={t.house.heightTitle}
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(undefined); // back to the stored value; a later blur commits nothing
      }}
    />
  );
}
