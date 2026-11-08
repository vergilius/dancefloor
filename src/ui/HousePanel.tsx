// House panel (PLAN.md §5 M5): "Z rzutu dachu", "Dodaj blok" and one entry per block (derived values shown so the
// browser check can compare them with the drawings; rename, heights, re-draw, delete).
import { useMemo, useState } from 'react';
import {
  DEFAULT_BOTTOM,
  DEFAULT_TOP,
  hasRoofLayer,
  isValidBlock,
  mainBodyFromRoof,
  polygonArea,
  wallFace,
  type Block,
  type MainBody,
  type Vec2,
} from '../house/blocks';
import { blocksFromPlan, columnHeights, WALL_LAYER, type PlanBlocks } from '../house/fromPlan';
import { formatHeight, formatRel } from '../project/levels';
import { useDrawnSheets } from '../state/drawn';
import { useRefValue } from '../state/levels';
import { useProject } from '../state/store';
import { t } from './strings';

const sheetName = (file: string) => file.replace(/\.dwg$/i, '').split(' - ')[0]!;
const LEVELS_LIST = 'house-levels';
/** A relative height label on an elevation/section: `+3.59`, `−0.32`, `-1,40` (absolute values are left out). */
const REL_LABEL = /^[+−-]\s*(\d{1,2}[.,]\d{2,3})$/;

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
  const main = blocks.find((b) => b.kind === 'gable');
  // The ground plan: a horizontal plan with walls, nearest to ±0.00.
  const ground = useMemo(
    () =>
      drawn
        .filter((d) => d.kind === 'plan' && d.placement.type === 'horizontal' && d.sheet.layers.some((l) => l.name === WALL_LAYER))
        .sort((a, b) => Math.abs(a.placement.type === 'horizontal' ? a.placement.z : 0) - Math.abs(b.placement.type === 'horizontal' ? b.placement.z : 0))[0],
    [drawn],
  );
  const [fromPlan, setFromPlan] = useState<(PlanBlocks & { file: string; columnsFrom?: string }) | undefined>();

  const buildFromPlan = () => {
    if (!ground || main?.kind !== 'gable') return;
    const r = blocksFromPlan(ground.sheet, main);
    // Column heights from the first placed elevation/section that draws columns.
    const columnsFrom = drawn.flatMap((d) => {
      const h = d.placement.type === 'vertical' ? columnHeights(d.sheet) : undefined;
      return h ? [{ ...h, file: d.file }] : [];
    })[0];
    // A block with the same name keeps its heights, so running it again doesn't undo the heights set by hand.
    // Heights read from a sheet (columns) win over kept ones.
    const put = (name: string, polygon: Vec2[], heights?: { bottom: number; top: number }) => {
      const old = useProject.getState().house.blocks.find((b) => b.name === name);
      const kept = old?.kind === 'flat' ? { bottom: old.bottom, top: old.top } : { bottom: DEFAULT_BOTTOM, top: DEFAULT_TOP };
      putBlock({ kind: 'flat', name, polygon, ...(heights ?? kept) });
    };
    for (const a of r.annexes) put(t.house.annexName[a.side], a.polygon);
    r.slabs.forEach((p, i) => put(t.house.slabName(i + 1), p));
    r.posts.forEach((p, i) => put(t.house.postName(i + 1), p));
    r.columns.forEach((p, i) => put(t.house.columnName(i + 1), p, columnsFrom));
    setFromPlan({ ...r, file: ground.file, columnsFrom: columnsFrom?.file });
  };

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
        <button type="button" disabled={!ground || !main} title={t.house.fromPlanTitle} onClick={buildFromPlan}>
          {t.house.fromPlan}
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
        {roof && !main && <span className="muted"> {t.house.needsMain}</span>}
      </p>
      {fromPlan && (
        <p className="muted">
          {t.house.fromPlanResult(sheetName(fromPlan.file), fromPlan.annexes.length, fromPlan.slabs.length, fromPlan.posts.length, fromPlan.columns.length)}
          {fromPlan.columns.length > 0 && (
            <>
              <br />
              {fromPlan.columnsFrom ? t.house.columnsFrom(sheetName(fromPlan.columnsFrom)) : <span className="error">{t.house.columnsNoSection}</span>}
            </>
          )}
          {(fromPlan.slabOpenings > 0 || fromPlan.skippedLoops > 0) && (
            <>
              <br />
              {t.house.fromPlanSkipped(fromPlan.slabOpenings, fromPlan.skippedLoops)}
            </>
          )}
          <br />
          {t.house.setHeights}
        </p>
      )}
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
  const drawn = useDrawnSheets();
  const ref = useRefValue();
  const values = useMemo(() => {
    const out = new Set<string>();
    for (const d of drawn)
      if (d.placement.type === 'vertical')
        for (const tx of d.sheet.texts) {
          const m = REL_LABEL.exec(tx.text.trim());
          if (m) out.add(((tx.text.trim().startsWith('+') ? 1 : -1) * Number(m[1]!.replace(',', '.'))).toFixed(3));
        }
    for (const s of sheets) if (s.kind === 'plan' && s.placement?.type === 'horizontal') out.add(s.placement.z.toFixed(2));
    if (ref !== undefined)
      for (const p of Object.values(parsed)) if (p.status === 'done') for (const l of p.summary.labels.levels) out.add((l.value - ref).toFixed(2));
    return [...new Set([...out].map((v) => Number(v).toFixed(2)))].map(Number).sort((a, b) => a - b);
  }, [parsed, sheets, drawn, ref]);
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
          {b.bottom === DEFAULT_BOTTOM && b.top === DEFAULT_TOP && <div className="error">{t.house.defaultHeights}</div>}
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
