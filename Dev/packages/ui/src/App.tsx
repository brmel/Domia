import { Sidebar } from './features/Sidebar.js';
import { CasesView } from './features/CasesView.js';
import { RunsView } from './features/RunsView.js';
import { AuditsView } from './features/AuditsView.js';
import { SkillsView } from './features/SkillsView.js';
import { MemoryView } from './features/MemoryView.js';
import { SettingsView } from './features/SettingsView.js';
import { useNav } from './store.js';

export function App() {
  const view = useNav((s) => s.view);
  return (
    <div className="app">
      <Sidebar />
      <main className="pane">
        {view === 'cases' && <CasesView />}
        {view === 'runs' && <RunsView />}
        {view === 'audits' && <AuditsView />}
        {view === 'skills' && <SkillsView />}
        {view === 'memory' && <MemoryView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
