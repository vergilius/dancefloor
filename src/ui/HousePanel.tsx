// House panel (PLAN.md §5 M5): "Z rzutu dachu" and one line per block, with the derived values shown so the
// browser check can compare them with the drawings.
import { useMemo, useState } from 'react';
import { hasRoofLayer, mainBodyFromRoof, polygonArea, wallFace, type Block, type MainBody } from '../house/blocks';
import { formatHeight, formatRel } from '../project/levels';
import { useDrawnSheets } from '../state/drawn';
import { useRefValue } from '../state/levels';
import { useProject } from '../state/store';
import { t } from './strings';

const sheetName = (file: string) => file.replace(/\.dwg$/i, '').split(' - ')[0]!;

export function HousePanel() {
  const blocks = useProject((s) => s.house.blocks);
  const putBlock = useProject((s) => s.putBlock);
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
        </button>
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
      {blocks.length === 0 ? (
        <p className="muted">{t.house.none}</p>
      ) : (
        <ul className="house-blocks">
          {blocks.map((b) => (
            <li key={b.name}>
              <BlockLine block={b} refValue={ref} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BlockLine({ block: b, refValue }: { block: Block; refValue: number | undefined }) {
  const h = (v: number) => formatHeight(v, refValue);
  return (
    <>
      <strong>{b.name}</strong> <span className="muted">({t.house.kinds[b.kind]})</span>
      <br />
      {b.kind === 'gable' ? (
        <>
          {t.house.size(b.x1 - b.x0, b.y1 - b.y0)} · {t.house.pitch(b.pitch)} · {t.house.overhang(b.overhang)}
          <br />
          {t.house.ridge} {h(b.ridge)}
          <br />
          {t.house.wallFace} {h(wallFace(b))}
          <br />
          {t.house.bottom} {h(b.bottom)}
        </>
      ) : (
        <>
          {t.house.area(polygonArea(b.polygon))}
          <br />
          {t.house.top} {h(b.top)}
          <br />
          {t.house.bottom} {h(b.bottom)}
        </>
      )}
    </>
  );
}
