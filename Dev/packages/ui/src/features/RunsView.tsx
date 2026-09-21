import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';
import { useNav } from '../store.js';
import { LiveRun } from './LiveRun.js';

export function RunsView() {
  const activeRunId = useNav((s) => s.activeRunId);
  return activeRunId ? <LiveRun runId={activeRunId} /> : <RunList />;
}

function RunList() {
  const openRun = useNav((s) => s.openRun);
  const runs = useQuery({ queryKey: ['runs'], queryFn: async () => unwrap(await api.runs.list()) });
  return (
    <div className="stack">
      <h1>Runs</h1>
      {runs.isLoading && <p className="muted">Loading…</p>}
      <table className="table">
        <thead><tr><th>Request</th><th>Status</th><th>Started</th></tr></thead>
        <tbody>
          {runs.data?.rows.map((r) => (
            <tr key={r.runId} className="clickable" onClick={() => openRun(r.runId)}>
              <td>{r.request}</td>
              <td><span className={`status ${r.status}`}>{r.status}</span></td>
              <td className="muted small">{new Date(r.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
