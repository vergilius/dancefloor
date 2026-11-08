// Global keys (UI rework): 1–9 pick a tool of the strip, Esc goes back to Zaznacz, N toggles the panel, F the clean
// view, Ctrl/Cmd+Z / Shift+Z / Y undo and redo in the active version. W/A/S/D/Q/E stay with the camera (KeyPan).
// Ctrl+Space (maximize the viewport under the cursor) lives in the Viewport, which knows the hovered half.
import { useEffect } from 'react';
import { useUi } from '../state/ui';
import { useVersions } from '../state/versions';
import { activateTool, toolsOf } from './tools';

const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
/** Fields with their own text undo. A focused checkbox, button or select (focus stays after a click) must not block Cmd+Z. */
const NON_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);
const textEntry = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !NON_TEXT.has(t.type));

export function enterClean() {
  useUi.getState().setClean(true);
  // Fullscreen may be refused (no user gesture, iframe): the clean view still works in the window.
  document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function exitClean() {
  useUi.getState().setClean(false);
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      const v = useVersions.getState();
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (e.altKey || textEntry(e.target) || !v.history[v.active]) return;
        if (k === 'z' && !e.shiftKey) v.undo();
        else if ((k === 'z' && e.shiftKey) || k === 'y') v.redo();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey || typing(e.target)) return;
      if (k === 'escape') {
        if (ui.clean) return exitClean();
        // A drag in progress or a selection: the edit tool handles this Esc (cancel / deselect) first.
        if (v.tool && !v.draft && !v.selected) activateTool('select');
        return;
      }
      if (k === 'f') {
        e.preventDefault();
        return ui.clean ? exitClean() : enterClean();
      }
      if (ui.clean) return;
      if (k === 'n') ui.togglePanel();
      else if (/^[1-9]$/.test(k)) {
        const tool = toolsOf(ui.workspace)[Number(k) - 1];
        if (tool) activateTool(tool.id);
      } else return;
      e.preventDefault();
    };
    // Capture: runs before the tools' own Esc handlers, so it sees the drag / selection they are about to clear.
    window.addEventListener('keydown', onKey, { capture: true });
    const onFullscreen = () => {
      if (!document.fullscreenElement && useUi.getState().clean) useUi.getState().setClean(false);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);
}
