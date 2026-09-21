import type { AgentTurn, Outcome, RunEvent, RunId, Store, TokenUsage, ToolCall, ToolOutput } from '@domia/contracts';
import type { EventHub } from './internals.js';

function turnSummary(turn: AgentTurn): string {
  switch (turn.kind) {
    case 'act': return turn.calls.map((c) => c.name).join(', ');
    case 'final': return turn.summary;
    case 'ask': return turn.question;
  }
}

/**
 * Record-keeping for a run: the append-only exchange tape (the replay source) plus
 * the live event stream. One place that knows "what happened gets written here",
 * so the drive loop stays about deciding, not bookkeeping.
 */
export class RunJournal {
  private seq = 0;

  constructor(private readonly runId: RunId, private readonly store: Store, private readonly hub: EventHub) {}

  private async append(direction: 'agent' | 'tool' | 'user', payload: unknown, usage?: TokenUsage): Promise<void> {
    // Trace persistence must never break a run.
    await this.store.exchanges
      .append({ runId: this.runId, seq: this.seq++, direction, payload, ...(usage ? { usage } : {}), at: new Date().toISOString() })
      .catch(() => undefined);
  }

  emit(e: RunEvent): void { this.hub.emit(e); }

  async recordTurn(turn: AgentTurn, seq: number, usage?: TokenUsage): Promise<void> {
    await this.append('agent', turn, usage);
    this.emit({ type: 'turn', runId: this.runId, seq, turn: { kind: turn.kind, summary: turnSummary(turn) } });
  }

  async recordCall(call: ToolCall, outcome: Outcome<ToolOutput>): Promise<void> {
    await this.append('tool', { name: call.name, args: call.args, status: outcome.status });
    this.emit({ type: 'call', runId: this.runId, call: { callId: call.callId, name: call.name }, status: outcome.status });
  }

  async recordUser(message: string): Promise<void> {
    await this.append('user', { message });
  }
}
