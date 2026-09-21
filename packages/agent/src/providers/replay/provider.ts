import { newId } from '@domia/kernel';
import { resultErr, resultOk, domiaError, moduleId, brandId, outcomeOk, metaSince } from '@domia/contracts';
import type {
  AgentConfig, AgentContext, AgentProvider, AgentState, AgentStreamEvent, AgentTurn, ContextId,
  ConversationSnapshot, ModelInfo, ModuleResult, Outcome, StepInput, Tracer,
} from '@domia/contracts';

const AGENT = moduleId('agent');
const PROVIDER = 'replay';

/** Serves recorded turns in order — the test double that is real data. */
export class ReplayAgentContext implements AgentContext {
  readonly id: ContextId = brandId<'ContextId'>(newId(12));
  private cursor = 0;
  constructor(private config: AgentConfig, private readonly turns: readonly AgentTurn[], private readonly tracer: Tracer) {}

  configure(patch: Partial<AgentConfig>): ModuleResult<void> { this.config = { ...this.config, ...patch }; return resultOk(undefined); }
  inspect(): Readonly<AgentConfig & AgentState> { return { ...this.config, turnCount: this.cursor, usage: { input: 0, output: 0 } }; }

  async step(_input: StepInput): Promise<ModuleResult<Outcome<AgentTurn>>> {
    const started = new Date().toISOString();
    return this.tracer.withSpan('agent.step', { turn: this.cursor + 1, replay: true }, async (span) => {
      const turn = this.turns[this.cursor];
      if (!turn) { span.end('failed'); return resultErr(domiaError(AGENT, 'AGENT_MALFORMED', `replay exhausted at step ${this.cursor}`)); }
      this.cursor++;
      return resultOk(outcomeOk(turn, metaSince(started, span.traceId, span.spanId)));
    });
  }
  async *stream(): AsyncIterable<AgentStreamEvent> {}
  async fork(): Promise<ModuleResult<AgentContext>> { return resultOk(new ReplayAgentContext(this.config, this.turns.slice(this.cursor), this.tracer)); }
  async snapshot(): Promise<ModuleResult<ConversationSnapshot>> { return resultOk({ provider: PROVIDER, version: '1', blob: { cursor: this.cursor } }); }
  async restore(s: ConversationSnapshot): Promise<ModuleResult<void>> {
    if (s.provider !== PROVIDER) return resultErr(domiaError(AGENT, 'BAD_CONFIG', `snapshot from '${s.provider}'`));
    this.cursor = (s.blob as { cursor: number }).cursor;
    return resultOk(undefined);
  }
  async dispose(): Promise<void> {}
}

export class ReplayProvider implements AgentProvider {
  readonly id = 'replay';
  constructor(private readonly turnsFor: (config: AgentConfig) => readonly AgentTurn[], private readonly tracer: Tracer) {}
  async models(): Promise<ModuleResult<readonly ModelInfo[]>> { return resultOk([{ id: 'replay' }]); }
  async alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>> { return resultOk(new ReplayAgentContext(config, this.turnsFor(config), this.tracer)); }
}
