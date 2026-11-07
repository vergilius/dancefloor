import { Viewport } from './scene/Viewport';
import { FolderPanel } from './ui/FolderPanel';
import { t } from './ui/strings';

export function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>{t.appTitle}</h1>
        <FolderPanel />
      </aside>
      <main className="viewport">
        <Viewport />
      </main>
    </div>
  );
}
