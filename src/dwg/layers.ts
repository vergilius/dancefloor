// Layer names we create ourselves (not in the DWG). Shared by the worker (normalize) and the app (layer groups).

/** Door swing arcs (ARC on `A-DOOR`, all 90° in the real files) are split off so they can be hidden: not real geometry. */
export const DOOR_SWING_LAYER = 'A-DOOR (łuki)';
