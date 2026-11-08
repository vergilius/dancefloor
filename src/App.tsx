import { Viewport } from './scene/Viewport';
import { useUi } from './state/ui';
import { Header } from './ui/Header';
import { Panel } from './ui/Panel';
import { useShortcuts } from './ui/shortcuts';
import { StatusBar } from './ui/StatusBar';
import { ToolStrip } from './ui/ToolStrip';

export function App() {
  useShortcuts();
  const clean = useUi((s) => s.clean);
  const panelOpen = useUi((s) => s.panelOpen);
  // Clean view hides the chrome with CSS: the header owns the folder restore and must not remount.
  // The viewport stays at the same place in the tree in every mode, so the canvas is never remounted.
  return (
    <div className={`app${clean ? ' clean' : ''}${panelOpen ? '' : ' no-panel'}`}>
      <Header />
      <ToolStrip />
      <main className="viewport">
        <Viewport />
      </main>
      {panelOpen && <Panel />}
      <StatusBar />
    </div>
  );
}
