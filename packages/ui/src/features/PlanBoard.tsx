import { useQuery } from '@tanstack/react-query';
import type { RunId } from '@domia/contracts';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';

export function PlanBoard({ runId, tick }: { runId: RunId; tick: number }) {
  const plan = useQuery({ queryKey: ['plan', runId, tick], queryFn: async () => unwrap(await api.plans.get(runId)) });
  const items = plan.data?.items ?? [];
  return (
    <div className="board">
      <h3>Plan</h3>
      {items.length === 0 && <p className="muted small">No plan yet.</p>}
      {items.map((item) => (
        <div key={item.id} className={`plan-item ${item.status}`}>
          <span className="dot" />
          <div>
            <div>{item.title}</div>
            <div className="muted small">{item.intent}</div>
            {item.note && <div className="note small">{item.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
