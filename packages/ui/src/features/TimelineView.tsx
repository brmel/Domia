import { useQuery } from '@tanstack/react-query';
import type { RunId } from '@domia/contracts';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';

export function TimelineView({ runId }: { runId: RunId }) {
  const timeline = useQuery({ queryKey: ['timeline', runId], queryFn: async () => unwrap(await api.traces.timeline(runId)) });
  return (
    <div className="stack">
      <h3>Timeline</h3>
      <div className="timeline">
        {timeline.data?.map((entry, i) => (
          <div key={i} className={`tl ${entry.kind}`}>
            <span className="muted small">{new Date(entry.at).toLocaleTimeString()}</span>
            <span className="tl-kind">{entry.kind}</span>
            <span>{entry.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
