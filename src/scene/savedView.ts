// Camera view, kept per project folder in localStorage (a view preference, not project data, so it
// doesn't go through the explicit "Zapisz" of dancefloor.json). Storage can be missing or throw: then
// the app just frames the plans as before.

/** Ortho views from the side, named by where the camera stands (world y = north). */
export type Side = 'north' | 'east' | 'south' | 'west';

export type SavedView = {
  /** Orthographic camera: from above, or from `side` when set. */
  top: boolean;
  side?: Side;
  /** Scene point the camera looks at. */
  target: [number, number, number];
  /** Visible world height in metres: the scale shared by the perspective and the top (ortho) camera. */
  height: number;
  /** Unit vector target → camera of the last perspective view, so leaving the top view returns to it. */
  dir: [number, number, number];
};

const key = (project: string) => `dancefloor.view:${project}`;

export function loadView(project: string): SavedView | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key(project)) ?? 'null') as SavedView | null;
    return v && v.target?.length === 3 && v.dir?.length === 3 && v.height > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function storeView(project: string, view: SavedView) {
  try {
    localStorage.setItem(key(project), JSON.stringify(view));
  } catch {
    // Storage blocked or full: the view just isn't remembered.
  }
}
