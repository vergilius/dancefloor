// Editor shell state (UI rework): workspace, viewport layout, panel tab, clean view. A view preference, kept per
// project folder in localStorage like the camera view (savedView.ts), not in dancefloor.json.
import { create } from 'zustand';

/** Rysunki = set up the drawings; Model = shape the terrain (edit & showcase). */
export type Workspace = 'drawings' | 'model';
/** Which viewports are open: both halves, or one of them full width (they share one camera, ADR 0001). */
export type Layout = 'both' | 'design' | 'env';
export type Tab = 'sheets' | 'terrain' | 'house' | 'version';

export const TABS: Record<Workspace, Tab[]> = { drawings: ['sheets', 'terrain', 'house'], model: ['version'] };
const DEFAULT_LAYOUT: Record<Workspace, Layout> = { drawings: 'both', model: 'env' };

type Saved = { workspace: Workspace; layout: Layout; tab: Record<Workspace, Tab>; panelOpen: boolean };

type UiState = Saved & {
  /** Clean view: Environment only, no chrome, nicer render (showcase). Not saved. */
  clean: boolean;
  setWorkspace(w: Workspace): void;
  setLayout(l: Layout): void;
  setTab(tab: Tab): void;
  togglePanel(): void;
  setClean(on: boolean): void;
  /** Applies the saved state of a project folder, or the defaults (Model once it has an edit version). */
  restore(project: string, hasVersions: boolean): void;
};

const key = (project: string) => `dancefloor.ui:${project}`;
let project: string | undefined;

const defaults = (workspace: Workspace): Saved => ({
  workspace,
  layout: DEFAULT_LAYOUT[workspace],
  tab: { drawings: 'sheets', model: 'version' },
  panelOpen: true,
});

function load(p: string): Saved | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key(p)) ?? 'null') as Saved | null;
    return v && (v.workspace === 'drawings' || v.workspace === 'model') ? { ...defaults(v.workspace), ...v } : undefined;
  } catch {
    return undefined;
  }
}

export const useUi = create<UiState>((set, get) => {
  const save = () => {
    if (!project) return;
    const { workspace, layout, tab, panelOpen } = get();
    try {
      localStorage.setItem(key(project), JSON.stringify({ workspace, layout, tab, panelOpen }));
    } catch {
      // Storage missing or full: the shell just starts from the defaults next time.
    }
  };
  const put = (s: Partial<Saved>) => {
    set(s);
    save();
  };
  return {
    ...defaults('drawings'),
    clean: false,
    setWorkspace: (workspace) => put({ workspace, layout: DEFAULT_LAYOUT[workspace] }),
    setLayout: (layout) => put({ layout }),
    setTab: (tab) => put({ tab: { ...get().tab, [get().workspace]: tab } }),
    togglePanel: () => put({ panelOpen: !get().panelOpen }),
    setClean: (clean) => set({ clean }),
    restore(p, hasVersions) {
      project = p;
      set({ ...(load(p) ?? defaults(hasVersions ? 'model' : 'drawings')), clean: false });
    },
  };
});

/** Layout actually drawn: clean view shows the Environment only. Read per frame by the split render. */
export const drawnLayout = (s: Pick<UiState, 'layout' | 'clean'> = useUi.getState()): Layout => (s.clean ? 'env' : s.layout);
