import { Viewport } from './scene/Viewport';
import { t } from './ui/strings';

export function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>{t.appTitle}</h1>
        <p>{t.noProject}</p>
      </aside>
      <main className="viewport">
        <Viewport />
      </main>
    </div>
  );
}
