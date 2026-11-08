// Left tool strip (UI rework): the workspace's tools as one radio group; the active one carries the accent.
import { useUi } from '../state/ui';
import { activateTool, toolsOf, useActiveTool, useToolBlocked, type ToolDef } from './tools';
import { t } from './strings';

export function ToolStrip() {
  const workspace = useUi((s) => s.workspace);
  const active = useActiveTool();
  return (
    <nav className="tool-strip" role="radiogroup">
      {toolsOf(workspace).map((d, i) => (
        <ToolButton key={d.id} def={d} n={i + 1} on={active === d.id} />
      ))}
    </nav>
  );
}

function ToolButton({ def, n, on }: { def: ToolDef; n: number; on: boolean }) {
  const why = useToolBlocked(def.id);
  const Icon = def.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={def.label}
      disabled={why !== undefined}
      title={`${def.label} (${t.tools.shortcut(n)})\n${why ?? def.title}`}
      onClick={() => activateTool(def.id)}
    >
      <Icon size={20} />
      <span className="key">{n}</span>
    </button>
  );
}
