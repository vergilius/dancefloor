// Edge modes ← → ↓ ↑ (Uskok / Skarpa / Mur) and the Skarpa ratio 1:n of an edit (PLAN.md §5 M4b). Used in the
// Environment bar and in the edit list; hovering a side outlines that edge of the selected edit in the view.
import { useVersions } from '../state/versions';
import { EDGE_MODES, SIDES, type EdgeMode, type Edges } from '../versions/edits';
import { ZInput } from './SheetList';
import { t } from './strings';

export function EdgeControls({
  id,
  edges,
  slope,
  onChange,
}: {
  /** Keys the ratio field, so it re-reads its value when the target edit changes. */
  id: string;
  edges: Edges;
  slope: number;
  onChange: (shape: { edges?: Edges; slope?: number }) => void;
}) {
  const setHoverSide = useVersions((s) => s.setHoverSide);
  return (
    <span className="edge-row">
      {SIDES.map((side) => (
        <label key={side} title={t.versions.sideTitles[side]} onPointerEnter={() => setHoverSide(side)} onPointerLeave={() => setHoverSide(undefined)}>
          {t.versions.sides[side]}
          <select value={edges[side]} onChange={(ev) => onChange({ edges: { ...edges, [side]: ev.target.value as EdgeMode } })}>
            {EDGE_MODES.map((m) => (
              <option key={m} value={m}>
                {t.versions.edgeModes[m]}
              </option>
            ))}
          </select>
        </label>
      ))}
      {SIDES.some((side) => edges[side] === 'slope') && (
        <label title={t.versions.slopeTitle}>
          1:
          <ZInput key={id} value={slope} accept={(v) => v > 0} onChange={(v) => onChange({ slope: v })} />
        </label>
      )}
    </span>
  );
}
