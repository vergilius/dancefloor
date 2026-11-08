// Tool strip (UI rework): one radio group per workspace, with an explicit Zaznacz. The tools themselves keep their
// own state (measure / houseDraw in the project store, the edit tool in the versions store); this only maps them to
// one active id and switches between them.
import { BrickWall, Equal, MousePointer2, PenTool, Ruler, ArrowDownToLine, ArrowUpToLine, type LucideIcon } from 'lucide-react';
import { useProject } from '../state/store';
import { useVersions } from '../state/versions';
import { drawnLayout, useUi, type Workspace } from '../state/ui';
import type { Tool } from '../versions/edits';
import { t } from './strings';

export type ToolId = 'select' | 'measure' | 'draw' | Tool;

export type ToolDef = { id: ToolId; icon: LucideIcon; label: string; title: string };

const DEFS: Record<ToolId, ToolDef> = {
  select: { id: 'select', icon: MousePointer2, label: t.tools.select, title: t.tools.selectTitle },
  measure: { id: 'measure', icon: Ruler, label: t.measure.button, title: t.measure.title },
  draw: { id: 'draw', icon: PenTool, label: t.tools.draw, title: t.house.addBlockTitle },
  level: { id: 'level', icon: Equal, label: t.versions.tools.level, title: t.versions.toolTitles.level },
  raise: { id: 'raise', icon: ArrowUpToLine, label: t.versions.tools.raise, title: t.versions.toolTitles.raise },
  lower: { id: 'lower', icon: ArrowDownToLine, label: t.versions.tools.lower, title: t.versions.toolTitles.lower },
  wall: { id: 'wall', icon: BrickWall, label: t.versions.tools.wall, title: t.versions.toolTitles.wall },
};

const STRIPS: Record<Workspace, ToolId[]> = {
  drawings: ['select', 'measure', 'draw'],
  model: ['select', 'level', 'raise', 'lower', 'wall', 'measure'],
};

export const toolsOf = (w: Workspace) => STRIPS[w].map((id) => DEFS[id]);
export const toolDef = (id: ToolId) => DEFS[id];

const isEditTool = (id: ToolId): id is Tool => id !== 'select' && id !== 'measure' && id !== 'draw';

/** The active tool; undefined while the 2-point alignment runs (it has its own prompt). */
export function useActiveTool(): ToolId | undefined {
  const measure = useProject((s) => s.measure !== undefined);
  const draw = useProject((s) => s.houseDraw !== undefined);
  const align = useProject((s) => s.align !== undefined);
  const edit = useVersions((s) => s.tool);
  if (align) return undefined;
  return measure ? 'measure' : draw ? 'draw' : (edit ?? 'select');
}

/** Why a tool can't be used, or undefined. Pomiar and Rysuj blok pick on the sheets, in the Design viewport only. */
function blocked(id: ToolId, inPreview: boolean, designClosed: boolean): string | undefined {
  if (isEditTool(id) && inPreview) return t.tools.needsVersion;
  if ((id === 'measure' || id === 'draw') && designClosed) return t.tools.needsDesign;
  return undefined;
}

export function useToolBlocked(id: ToolId): string | undefined {
  const inPreview = useVersions((s) => s.active === 'preview');
  const designClosed = useUi((s) => drawnLayout(s) === 'env');
  return blocked(id, inPreview, designClosed);
}

/** Ends whatever tool runs, then starts `id` (Zaznacz = none). */
export function activateTool(id: ToolId) {
  if (blocked(id, useVersions.getState().active === 'preview', drawnLayout() === 'env')) return;
  const p = useProject.getState();
  p.stopMeasure();
  p.cancelHouseDraw();
  p.cancelAlign();
  useVersions.getState().setTool(undefined);
  if (id === 'measure') p.startMeasure();
  else if (id === 'draw') p.startHouseDraw();
  else if (isEditTool(id)) useVersions.getState().setTool(id);
}
