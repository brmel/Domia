import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newId } from '@domia/kernel';
import { resultOk, resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type {
  AgentContext, CaseContext, CaseId, ContextId, HumanReply, LoopRun, ModuleResult, Outcome, PlanContext, RunConfig,
  RunEvent, RunId, RunOptions, RunReport, RunState, Store, TargetSession, Tracer,
} from '@domia/contracts';
import { EventHub, type RunInternals } from './internals.js';
import { RunControl } from './control.js';
import { RunJournal } from './journal.js';
import { assembleRun, disposeResources, type RunResources } from './assemble.js';
import { drive } from './drive.js';
import type { RunDeps } from './deps.js';

const LOOP = moduleId('loop');

export type { RunDeps } from './deps.js';

/**
 * A run as a MIL context: alloc → start → dispose, with a user-authority control
 * surface. Composition only — control, bookkeeping, assembly and the loop each
 * live in their own unit (this is the anti-god-object seam).
 */
export class LoopRunImpl implements LoopRun, RunInternals {
  readonly id: ContextId = brandId<'ContextId'>(newId(12));
  readonly runId: RunId = brandId<'RunId'>(newId(12));

  private config: RunConfig;
  private state: RunState = { status: 'allocated', turns: 0 };
  private readonly hub = new EventHub();
  private readonly control = new RunControl();
  private readonly journal: RunJournal;
  private resources: RunResources | null = null;

  constructor(private readonly d: RunDeps) {
    this.config = { ...(d.options.approvals ? { approvals: d.options.approvals } : {}) };
    this.journal = new RunJournal(this.runId, d.store, this.hub);
  }

  // --- RunInternals: what meta-tool handlers may touch ---
  get caseCtx(): CaseContext { return this.d.caseCtx; }
  get caseId(): CaseId { return this.d.caseCtx.case.id; }
  get tracer(): Tracer { return this.d.tracer; }
  get store(): Store { return this.d.store; }
  get options(): RunOptions { return this.d.options; }
  get session(): TargetSession { return this.required().session; }
  get plan(): PlanContext { return this.required().plan; }
  get agent(): AgentContext { return this.required().agent; }
  emit(e: RunEvent): void { this.hub.emit(e); }

  private required(): RunResources {
    if (!this.resources) throw new Error('run resources accessed before start()');
    return this.resources;
  }

  // --- Context surface ---
  configure(patch: Partial<RunConfig>): ModuleResult<void> { this.config = { ...this.config, ...patch }; return resultOk(undefined); }
  inspect(): Readonly<RunConfig & RunState> { return { ...this.config, ...this.state }; }
  events(signal?: AbortSignal): AsyncIterable<RunEvent> { return this.hub.stream(signal); }

  // --- Control surface (user authority) ---
  async pause(): Promise<ModuleResult<void>> { this.control.pause(); this.state = { ...this.state, status: 'paused' }; return resultOk(undefined); }
  async resume(): Promise<ModuleResult<void>> { this.control.resume(); this.state = { ...this.state, status: 'running' }; return resultOk(undefined); }
  async cancel(reason: string): Promise<ModuleResult<void>> { this.control.cancel(reason); return resultOk(undefined); }

  async answer(reply: HumanReply): Promise<ModuleResult<void>> {
    const r = this.control.answer(reply);
    if (r.isOk()) { this.state = { ...this.state, status: 'running' }; await this.journal.recordUser(JSON.stringify(reply)); }
    return r;
  }

  /** user.ask / approval / takeover. Never hangs unattended (D12). */
  async requestHuman(question: string, kind: 'ask' | 'approval' | 'takeover'): Promise<ModuleResult<HumanReply>> {
    if (this.d.options.interactive === false) {
      await this.suspend(`needs human: ${question}`);
      return resultErr(domiaError(LOOP, 'SUSPENDED', 'suspended awaiting human (non-interactive)'));
    }
    this.state = { ...this.state, status: 'waiting_user' };
    this.emit({ type: 'waiting_user', runId: this.runId, question, kind });
    return this.control.awaitHuman();
  }

  /** Snapshot the conversation and stop; `domia run resume` picks it back up. */
  async suspend(reason: string): Promise<ModuleResult<void>> {
    const agent = this.resources?.agent;
    if (agent) {
      const snap = await agent.snapshot();
      if (snap.isOk()) {
        const blobPath = join(this.d.caseCtx.workdir, `snapshot-${this.runId}.json`);
        await writeFile(blobPath, JSON.stringify(snap.value)).catch(() => undefined);
        await this.d.store.snapshots.save({ runId: this.runId, provider: snap.value.provider, blobPath, at: new Date().toISOString() });
      }
    }
    this.control.markSuspended();
    this.state = { ...this.state, status: 'suspended' };
    this.emit({ type: 'signal', runId: this.runId, signal: { kind: 'idle', message: `suspended: ${reason}` } });
    return resultOk(undefined);
  }

  // --- Execute ---
  async start(): Promise<ModuleResult<Outcome<RunReport>>> {
    const assembled = await assembleRun(this.d, this.runId, this);
    if (assembled.isErr()) return resultErr(assembled.error);
    this.resources = assembled.value;
    this.resources.plan.onChange((rev) => this.emit({ type: 'plan', runId: this.runId, revision: rev.revision, diff: rev.diff }));
    this.state = { status: 'running', turns: 0 };

    // Selective injection (R3): only memories relevant to THIS request are seeded.
    const relevant = await this.d.memorySvc.relevant(this.d.caseCtx.case.id, this.d.request);
    const memory = relevant.isOk() ? relevant.value.map((m) => `${m.title}: ${m.body.trim()}`) : [];

    try {
      const outcome = await drive({
        runId: this.runId,
        request: this.d.request,
        maxTurns: this.d.maxTurns,
        tracer: this.d.tracer,
        control: this.control,
        journal: this.journal,
        resources: this.resources,
        nudgeAsk: this.d.nudgeAsk,
        thresholds: this.d.thresholds,
        ...(memory.length ? { memory } : {}),
        onTurn: () => { this.state = { ...this.state, turns: this.state.turns + 1 }; },
        turns: () => this.state.turns,
        emit: (e) => this.emit(e),
      });
      this.state = { ...this.state, status: 'terminal' };
      this.emit({ type: 'terminal', runId: this.runId, status: outcome.status, report: outcome.status === 'ok' ? outcome.value : fallbackReport() });
      return resultOk(outcome);
    } finally {
      this.hub.end();
      await disposeResources(this.resources);
      this.resources = null;
    }
  }

  async dispose(): Promise<void> {
    this.hub.end();
    if (this.resources) { await disposeResources(this.resources); this.resources = null; }
  }
}

function fallbackReport(): RunReport {
  return { summary: '(run ended without a report)', stats: { turns: 0, calls: 0, usage: { input: 0, output: 0 }, durationMs: 0 } };
}
