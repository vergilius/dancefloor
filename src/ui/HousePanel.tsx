// House panel (PLAN.md §5 M5): "Z rzutu dachu", "Dodaj blok" and one entry per block (derived values shown so the
// browser check can compare them with the drawings; rename, heights, re-draw, delete).
import { useMemo, useState } from 'react';
import {
  DEFAULT_BOTTOM,
  DEFAULT_TOP,
  blockOutline,
  hasRoofLayer,
  isValidBlock,
  mainBodyFromRoof,
  polygonArea,
  wallFace,
  type Block,
  type MainBody,
  type Vec2,
} from '../house/blocks';
import { blocksFromPlan, centre, columnHeights, facesSide, heightsFrom, pointInPolygon, recessesFromPlan, soffitFrom, WALL_LAYER, type PlanBlocks } from '../house/fromPlan';
import { formatHeight, formatRel } from '../project/levels';
import { useDrawnSheets } from '../state/drawn';
import { useHouse3D } from '../state/house';
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
  const [fromPlan, setFromPlan] = useState<(PlanBlocks & { file: string; notes: string[]; unset: string[] }) | undefined>();

  const buildFromPlan = () => {
    if (!ground || main?.kind !== 'gable') return;
    const r = blocksFromPlan(ground.sheet, main);
    const elevations = drawn.flatMap((d) =>
      d.kind === 'elevation' && d.placement.type === 'vertical' ? [{ sheet: d.sheet, origin: d.placement.origin, dir: d.placement.dir, file: d.file }] : [],
    );
    // Column heights from the first placed elevation/section that draws columns.
    const columnsFrom = drawn.flatMap((d) => {
      const h = d.placement.type === 'vertical' ? columnHeights(d.sheet) : undefined;
      return h ? [{ ...h, file: d.file }] : [];
    })[0];
    const mainOutline = blockOutline(main);
    const notes: string[] = [];
    const unset: string[] = [];
    // Heights read from the sheets win; a block with the same name otherwise keeps its heights (set by hand).
    const put = (name: string, polygon: Vec2[], read: { bottom?: number; top?: number; from?: string }, holes: Vec2[][] = []) => {
      const old = useProject.getState().house.blocks.find((b) => b.name === name);
      const kept = old?.kind === 'flat' ? { bottom: old.bottom, top: old.top } : { bottom: DEFAULT_BOTTOM, top: DEFAULT_TOP };
      const block = { kind: 'flat' as const, name, polygon, ...(holes.length > 0 && { holes }), bottom: read.bottom ?? kept.bottom, top: read.top ?? kept.top };
      putBlock(isValidBlock(block) ? block : { ...block, ...kept });
      if (read.from) notes.push(t.house.heightsRead(name, read.bottom, read.top, read.from));
      else if (!old) unset.push(name);
    };
    const src = (h: { file: string; layer: string }) => `${sheetName(h.file)} ${h.layer}`;
    for (const a of r.annexes) {
      // Annex: the top (parapet) only; its walls keep reaching down to the foundations.
      const h = heightsFrom(a.polygon, elevations, 1, mainOutline);
      put(t.house.annexName[a.side], a.polygon, h ? { top: h.heights.at(-1)!, from: src(h) } : {});
    }
    const slabTops: { poly: Vec2[]; top: number; from: string }[] = [];
    r.slabs.forEach((p, i) => {
      const h = heightsFrom(p, elevations, 2, mainOutline);
      const name = t.house.slabName(i + 1);
      put(name, p, h ? { bottom: h.heights[0]!, top: h.heights.at(-1)!, from: src(h) } : {}, r.slabHoles[i]);
      if (h) slabTops.push({ poly: p, top: h.heights.at(-1)!, from: name });
    });
    // Supports stand on the deck: its top is their (read) bottom.
    let standOn: { z: number; from: string } | undefined;
    r.posts.forEach((p, i) => {
      const h = heightsFrom(p, elevations, 2, mainOutline);
      const name = t.house.postName(i + 1);
      put(name, p, h ? { bottom: h.heights[0]!, top: h.heights.at(-1)!, from: src(h) } : {});
      if (h) standOn ??= { z: h.heights[0]!, from: name };
    });
    const colRead = columnsFrom ? { bottom: columnsFrom.bottom, top: columnsFrom.top } : {};
    r.columns.forEach((p, i) => put(t.house.columnName(i + 1), p, colRead));
    if (columnsFrom && r.columns.length > 0) {
      notes.push(t.house.heightsRead(t.house.columnsAll(r.columns.length), columnsFrom.bottom, columnsFrom.top, `${sheetName(columnsFrom.file)} S-COLS`));
      standOn ??= { z: columnsFrom.bottom, from: t.house.columnsAll(r.columns.length) };
    }
    if (r.deck) put(t.house.deckName, r.deck, standOn ? { top: standOn.z, from: t.house.deckFrom(standOn.from) } : {});
    // Piers: from the deck up to the top of the slab they carry (they end the slab's edge, flush with it).
    r.piers.forEach((p, i) => {
      const slab = slabTops.find((st) => pointInPolygon(centre(p), st.poly));
      put(
        t.house.pierName(i + 1),
        p,
        slab ? { ...(standOn && { bottom: standOn.z }), top: slab.top, from: t.house.pierFrom(slab.from, standOn !== undefined) } : {},
      );
    });
    // Recesses (podcień) of the main body: top = the soffit line on the elevation looking straight at that side.
    const recesses = recessesFromPlan(ground.sheet, main).flatMap((q) => {
      const ring = [
        { x: q.x0, y: q.y0 },
        { x: q.x1, y: q.y0 },
        { x: q.x1, y: q.y1 },
        { x: q.x0, y: q.y1 },
      ];
      // Its floor: the ground plan's level (PAB-01 at ±0.00); its soffit from the elevation looking at that side.
      const floor = ground.placement.type === 'horizontal' ? ground.placement.z : 0;
      const h = elevations
        .filter((e) => facesSide(e, q.side))
        .map((e) => soffitFrom(ring, e, floor))
        .find(Boolean);
      if (!h) {
        unset.push(t.house.recessName(q.side));
        return [];
      }
      notes.push(t.house.heightsRead(t.house.recessName(q.side), floor, h.top, sheetName(h.file)));
      return [{ x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, bottom: floor, top: h.top }];
    });
    const body = useProject.getState().house.blocks.find((b) => b.kind === 'gable');
    if (body?.kind === 'gable') {
      const withRecesses = { ...body, ...(recesses.length > 0 ? { recesses } : { recesses: undefined }) };
      putBlock(isValidBlock(withRecesses) ? withRecesses : body);
    }
    setFromPlan({ ...r, file: ground.file, notes, unset });
  };

  const build = () => {
    if (!roof || roof.placement.type !== 'horizontal') return;
    const body = mainBodyFromRoof(roof.sheet, roof.placement.z, t.house.mainBodyName);
    if (!body) return;
    // Recesses come from the ground plan ("Z rzutu parteru"): keep them when the roof is read again.
    const old = useProject.getState().house.blocks.find((b) => b.name === body.block.name);
    const kept = old?.kind === 'gable' && old.recesses ? { ...body.block, recesses: old.recesses } : body.block;
    putBlock(isValidBlock(kept) ? kept : body.block);
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
          {t.house.fromPlanResult(sheetName(fromPlan.file), {
            annexes: fromPlan.annexes.length,
            slabs: fromPlan.slabs.length,
            deck: fromPlan.deck ? 1 : 0,
            posts: fromPlan.posts.length,
            piers: fromPlan.piers.length,
            columns: fromPlan.columns.length,
          })}
          {fromPlan.notes.map((n) => (
            <span key={n}>
              <br />
              {n}
            </span>
          ))}
          {fromPlan.unset.length > 0 && (
            <>
              <br />
              <span className="error">{t.house.heightsUnset(fromPlan.unset.join(', '))}</span>
            </>
          )}
          {fromPlan.skippedLoops > 0 && (
            <>
              <br />
              {t.house.fromPlanSkipped(fromPlan.skippedLoops)}
            </>
          )}
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
      <WallsSummary />
      <OpeningsSummary />
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

/** Hollow house (M5b): per storey, the wall lines drawn as faces. */
function WallsSummary() {
  const { storeys, slabList, thickness, thicknessFound, roofHoles } = useHouse3D();
  const ref = useRefValue();
  if (storeys.length === 0) return null;
  return (
    <>
      <h3>{t.house.wallsTitle}</h3>
      <ul className="house-blocks">
        {storeys.map((st) => (
          <li key={st.file}>
            {sheetName(st.file)} ({formatRel(st.z)}): {t.house.wallsLine(st.partitions, st.length)}
          </li>
        ))}
        <li>
          {t.house.shell(thickness)}
          {!thicknessFound && <span className="error"> {t.house.shellAssumed}</span>} · {t.house.roofHoles(roofHoles.length)}
        </li>
      </ul>
      <h3>{t.house.slabsTitle}</h3>
      <ul className="house-blocks">
        {slabList.map((sl) => (
          <li key={sl.name}>
            {sl.name}: {t.house.slabLine(formatRel(sl.bottom), formatHeight(sl.top, ref), sheetName(sl.from))}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Per placed elevation: openings found / drawn / not placed (T3), and each one with hide/show (T4). */
function OpeningsSummary() {
  const elevations = useHouse3D().openings;
  const shown = useProject((s) => s.showOpenings);
  const hidden = useProject((s) => s.house.hiddenOpenings);
  const toggle = useProject((s) => s.toggleOpening);
  if (elevations.length === 0) return null;
  return (
    <>
      <h3>{t.house.openingsTitle}</h3>
      <ul className="house-blocks">
        {elevations.map((e) => (
          <li key={e.file}>
            {sheetName(e.file)}:{' '}
            {shown
              ? t.house.openingsLine(e.found.length, e.placed.filter((o) => o.hole).length, e.placed.filter((o) => !o.hole).length, e.missed)
              : t.house.openingsHidden(e.found.length)}
            {e.hidden > 0 && t.house.openingsHiddenCount(e.hidden)}
            <details>
              <summary>{t.house.openingsList}</summary>
              <ul className="house-openings">
                {e.found.map((r, i) => {
                  const key = e.keys[i]!;
                  return (
                    <li key={key}>
                      <label title={t.house.openingShowTitle}>
                        <input type="checkbox" checked={!hidden.includes(key)} onChange={() => toggle(key)} />{' '}
                        {t.house.openingLine(r.x1 - r.x0, r.y1 - r.y0, formatRel(r.y0), r.x0)}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        ))}
      </ul>
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
          {b.recesses?.map((q, i) => (
            <div key={i}>
              {t.house.recess(q.x1 - q.x0, q.y1 - q.y0)} {formatRel(q.bottom)}…{h(q.top)}
            </div>
          ))}
          {height(t.house.bottom, b.bottom, (bottom) => ({ ...b, bottom }))}
        </>
      ) : (
        <>
          {t.house.area(polygonArea(b.polygon) - (b.holes ?? []).reduce((a, h) => a + polygonArea(h), 0))} · {t.house.corners(b.polygon.length)}
          {b.holes && b.holes.length > 0 && <> · {t.house.holes(b.holes.length)}</>}
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
