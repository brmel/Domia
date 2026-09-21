import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';

export function SkillsView() {
  const skills = useQuery({ queryKey: ['skills'], queryFn: async () => unwrap(await api.skills.list()) });
  return (
    <div className="stack">
      <h1>Skills</h1>
      {skills.isLoading && <p className="muted">Loading…</p>}
      {skills.data?.length === 0 && <p className="muted">No skills discovered.</p>}
      <div className="cards">
        {skills.data?.map((s) => (
          <div key={s.name} className="card">
            <div className="card-title">{s.name}</div>
            {s.tags.length > 0 && <div className="muted small">{s.tags.join(', ')}</div>}
            <p>{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
