// Bottom status bar (UI rework): the active tool and what to do next, live readouts (drag size, height), the 2-point
// prompt, and on the right the version / project save state and errors.
import { formatHeight } from '../project/levels';
import { CUT_COLOR, DIFF_SATURATION, FILL_COLOR } from '../scene/TerrainMesh';
import { useRefValue } from '../state/levels';
import { useProject } from '../state/store';
import { useActiveVersion, useVersions } from '../state/versions';
import { useReference } from '../state/vertical';
import { rectSize } from '../versions/edits';
import { t } from './strings';
import { toolDef, useActiveTool } from './tools';

export function StatusBar() {
  return (
    <footer className="status-bar">
      <ToolStatus />
      <span className="spacer" />
      <DiffLegend />
      <SaveStatus />
    </footer>
  );
}

function ToolStatus() {
  const tool = useActiveTool();
  const { draft, preview, selected } = useVersions();
  const version = useActiveVersion();
  const sel = version?.edits.find((e) => e.id === selected);
  const ref = useRefValue();
  if (tool === undefined) return <AlignPrompt />;
  const def = toolDef(tool);
  const Icon = def.icon;
  let hint: string = t.tools.selectHint;
  if (sel) hint = sel.tool === 'wall' ? t.versions.wallHint : t.versions.edgeHint;
  else if (tool === 'level') hint = t.versions.levelHint;
  else if (tool === 'raise' || tool === 'lower' || tool === 'wall') hint = t.versions.dragHint;
  else if (tool === 'measure') hint = t.measure.escHint;
  else if (tool === 'draw') hint = t.house.addBlockTitle;
  const size = draft && rectSize(draft);
  return (
    <>
      <span className="st-tool">
        <Icon size={14} /> {def.label}
      </span>
      {draft && size ? (
        <span className="st-item">
          <strong>{t.versions.rectSize(size.w, size.h, size.area)}</strong>
          {draft.z !== undefined && <> → {formatHeight(draft.z, ref)}</>}
          {draft.snap && <strong> = {draft.snap}</strong>}
          {preview && <span className="muted"> · {t.versions.heightHint}</span>}
        </span>
      ) : (
        <span className="st-item muted">{hint}</span>
      )}
    </>
  );
}

/** What the 2-point tool wants clicked next. */
function AlignPrompt() {
  const align = useProject((s) => s.align);
  const cancelAlign = useProject((s) => s.cancelAlign);
  const ref = useReference();
  if (!align) return null;
  const n = align.picks.length;
  const step = t.align.steps[n];
  return (
    <span className="st-item align-prompt">
      <span className="muted">{t.align.stepOf(n + 1)}</span>{' '}
      <strong>{step?.(sheetName(align.file), ref ? sheetName(ref.file) : t.align.referenceFallback)}</strong> · {t.align.escHint}{' '}
      <button type="button" onClick={cancelAlign}>
        {t.align.cancel}
      </button>
    </span>
  );
}

/** Short sheet name for prompts: "PAB-01 - RZUT PARTERU.dwg" → "PAB-01", others without the extension. */
const sheetName = (file: string) => file.replace(/\.(dwg|pdf)$/i, '').split(' - ')[0]!;

function DiffLegend() {
  const show = useVersions((s) => s.showDiff);
  const version = useActiveVersion();
  if (!show || !version) return null;
  return (
    <span className="st-item diff-legend">
      {t.versions.diffCut} −{DIFF_SATURATION.toFixed(1)} m
      <span className="diff-ramp" style={{ background: `linear-gradient(to right, ${CUT_COLOR}, #fff, ${FILL_COLOR})` }} />+
      {DIFF_SATURATION.toFixed(1)} m {t.versions.diffFill}
    </span>
  );
}

function SaveStatus() {
  const { saveError, unsaved, broken } = useVersions();
  const version = useActiveVersion();
  const hasProject = useProject((s) => s.dir !== undefined);
  const dirty = useProject((s) => s.dirty);
  const projectError = useProject((s) => s.saveError);
  if (!hasProject) return <span className="st-item muted">{t.shell.noFolder}</span>;
  return (
    <>
      {version ? (
        <span className="st-item">
          <strong>{version.name}</strong> · {t.versions.status(version.grid.cols, version.grid.rows, version.edits.length)}
          {!saveError && <> · {unsaved.includes(version.id) ? t.versions.unsaved : t.versions.saved}</>}
        </span>
      ) : (
        <span className="st-item muted">
          {t.versions.preview} · {t.versions.previewNote}
        </span>
      )}
      {saveError && (
        <span className="st-item error">
          {t.versions.saveError}: {saveError}
        </span>
      )}
      {broken.length > 0 && (
        <span className="st-item error" title={broken.map((b) => `${b.file || '—'}: ${b.error}`).join('\n')}>
          {t.versions.broken(broken.length)}
        </span>
      )}
      <span className={`st-item${dirty ? ' error' : ' muted'}`}>{dirty ? t.shell.status.unsaved : t.shell.status.saved}</span>
      {projectError && (
        <span className="st-item error">
          {t.saveError}: {projectError}
        </span>
      )}
    </>
  );
}
