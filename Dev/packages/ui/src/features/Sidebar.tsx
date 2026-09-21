import { useNav } from '../store.js';

const items = [
  { key: 'cases', label: 'Cases', action: (n: ReturnType<typeof useNav.getState>) => n.openCases() },
  { key: 'runs', label: 'Runs', action: (n: ReturnType<typeof useNav.getState>) => n.openRuns() },
  { key: 'audits', label: 'Audits', action: (n: ReturnType<typeof useNav.getState>) => n.openAudits() },
  { key: 'skills', label: 'Skills', action: (n: ReturnType<typeof useNav.getState>) => n.openSkills() },
  { key: 'memory', label: 'Memory', action: (n: ReturnType<typeof useNav.getState>) => n.openMemory() },
  { key: 'settings', label: 'Settings', action: (n: ReturnType<typeof useNav.getState>) => n.openSettings() },
] as const;

export function Sidebar() {
  const nav = useNav();
  return (
    <nav className="sidebar">
      <div className="brand">Domia</div>
      {items.map((item) => (
        <button
          key={item.key}
          className={nav.view === item.key ? 'nav-item active' : 'nav-item'}
          onClick={() => item.action(nav)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
