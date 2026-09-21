import { useState } from 'react';
import type { HumanReply, RunEvent, RunId } from '@domia/contracts';
import { api } from '../api.js';
import { useLiveRun } from '../useLiveRun.js';
import { useNav } from '../store.js';
import { PlanBoard } from './PlanBoard.js';
import { TimelineView } from './TimelineView.js';

export function LiveRun({ runId }: { runId: RunId }) {
  const openRuns = useNav((s) => s.openRuns);
  const live = useLiveRun(runId);
  const done = live.terminal !== null;
  return (
    <div className="stack">
      <div className="row between">
        <button onClick={openRuns}>← Runs</button>
        <span className={`status ${live.status}`}>{live.status}</span>
        <button disabled={done} onClick={() => void api.runs.cancel(runId, 'user cancelled')}>Cancel</button>
      </div>
      {live.waiting && <AnswerCard runId={runId} kind={live.waiting.kind} question={live.waiting.question} />}
      <div className="split">
        <ActivityLane events={live.events} />
        <PlanBoard runId={runId} tick={live.events.length} />
      </div>
      {live.terminal && <TerminalReport terminal={live.terminal} />}
      {done && <TimelineView runId={runId} />}
    </div>
  );
}

function ActivityLane({ events }: { events: readonly RunEvent[] }) {
  return (
    <div className="lane">
      <h3>Activity</h3>
      {events.map((e, i) => <div key={i} className={`lane-item ${e.type}`}>{eventLabel(e)}</div>)}
    </div>
  );
}

function eventLabel(e: RunEvent): string {
  switch (e.type) {
    case 'sync': return 'watching…';
    case 'turn': return `${e.turn.kind}: ${e.turn.summary}`;
    case 'call': return `→ ${e.call.name} (${e.status})`;
    case 'plan': return `✎ plan r${e.revision}: ${e.diff.summary}`;
    case 'waiting_user': return `? ${e.kind}: ${e.question}`;
    case 'signal': return `~ ${e.signal.kind}: ${e.signal.message}`;
    case 'spawned': return `⑂ spawned ${e.childRunId}`;
    case 'terminal': return `● ${e.status}: ${e.report.summary}`;
  }
}

function AnswerCard({ runId, kind, question }: { runId: RunId; kind: 'ask' | 'approval' | 'takeover'; question: string }) {
  const [text, setText] = useState('');
  const send = (reply: HumanReply) => void api.runs.answer(runId, reply);
  return (
    <div className="card waiting">
      <div className="card-title">{kind === 'ask' ? 'Question' : kind === 'approval' ? 'Approval needed' : 'Takeover requested'}</div>
      <p>{question}</p>
      {kind === 'approval' ? (
        <div className="row">
          <button onClick={() => send({ kind: 'approve', approved: true })}>Approve</button>
          <button onClick={() => send({ kind: 'approve', approved: false })}>Deny</button>
        </div>
      ) : kind === 'takeover' ? (
        <button onClick={() => send({ kind: 'takeover_done' })}>I'm done — resume</button>
      ) : (
        <form className="row" onSubmit={(e) => { e.preventDefault(); send({ kind: 'answer', text }); setText(''); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer…" />
          <button type="submit">Send</button>
        </form>
      )}
    </div>
  );
}

function TerminalReport({ terminal }: { terminal: Extract<RunEvent, { type: 'terminal' }> }) {
  const { report } = terminal;
  return (
    <div className="card">
      <div className="card-title">Result — {terminal.status}{report.verdict ? ` (${report.verdict})` : ''}</div>
      <p>{report.summary}</p>
      <div className="muted small">
        {report.stats.turns} turns · {report.stats.calls} calls · {report.stats.usage.input + report.stats.usage.output} tokens · {(report.stats.durationMs / 1000).toFixed(1)}s
      </div>
    </div>
  );
}
