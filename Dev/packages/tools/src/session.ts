import { newId } from '@domia/kernel';
import { resultErr, resultOk, domiaError, moduleId, brandId, outcomeOk, outcomeFail, metaSince } from '@domia/contracts';
import type {
  CancelSignal, Capability, ContextId, ModuleResult, Observation, ObserveOptions,
  Outcome, SessionConfig, SessionState, TargetSession, TargetSpec, ToolBinding, ToolCall, ToolManifest,
  ToolOutput, Tracer, HumanHandback,
} from '@domia/contracts';

const TOOLS = moduleId('tools');
const TIMED_OUT = Symbol('timed-out');

/** Resolve to the tool result, or TIMED_OUT after ms (the tool promise is left to settle on its own). */
function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    void p.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(TIMED_OUT); });
  });
}

/**
 * One session, many bindings: the target driver plus every case-mounted MCP server
 * (E1). Invoke routes to whichever binding declares the tool, so adding a mount adds
 * capability with no change here. Invoke = span → binding.execute → outcome.
 */
export class TargetSessionImpl implements TargetSession {
  readonly id: ContextId = brandId<'ContextId'>(newId(12));
  private config: SessionConfig = {};
  private disposed = false;

  constructor(
    readonly target: TargetSpec,
    private readonly bindings: readonly ToolBinding[],
    private readonly caps: readonly Capability[],
    private readonly tracer: Tracer,
    private headed = false,
  ) {}

  /** The binding that declares this tool, if any. */
  private ownerOf(name: string): ToolBinding | undefined {
    return this.bindings.find((b) => b.manifests().some((m) => m.name === name));
  }

  configure(patch: Partial<SessionConfig>): ModuleResult<void> {
    this.config = { ...this.config, ...patch };
    return resultOk(undefined);
  }
  inspect(): Readonly<SessionConfig & SessionState> {
    return { ...this.config, target: this.target, capabilities: this.caps, headed: this.headed };
  }
  manifests(): readonly ToolManifest[] {
    return this.bindings.flatMap((b) => b.manifests());
  }

  async invoke(call: ToolCall, signal?: CancelSignal): Promise<ModuleResult<Outcome<ToolOutput>>> {
    if (this.disposed) return resultErr(domiaError(TOOLS, 'ALREADY_DISPOSED', 'session disposed'));
    if (signal?.aborted) return resultErr(domiaError(TOOLS, 'CANCELLED', 'cancelled before invoke'));
    const owner = this.ownerOf(call.name);
    if (!owner) return resultErr(domiaError(TOOLS, 'UNKNOWN_TOOL', `no tool '${call.name}' on this target`));

    const started = new Date().toISOString();
    return resultOk(await this.tracer.withSpan('tool.invoke', { tool: call.name, callId: call.callId }, async (span) => {
      const m = () => metaSince(started, span.traceId, span.spanId);
      // Honor the agent's per-call timeoutMs uniformly (adaptive timing): a slow tool
      // times out into a ran-but-failed outcome the agent reacts to, rather than
      // blocking the run. Providers that self-time (shell/fetch) still do so first.
      const raced = call.timeoutMs ? await raceTimeout(owner.execute(call, signal), call.timeoutMs) : await owner.execute(call, signal);
      if (raced === TIMED_OUT) return outcomeFail<ToolOutput>('timeout', domiaError(TOOLS, 'TOOL_TIMEOUT', `tool '${call.name}' exceeded ${call.timeoutMs}ms`, { retryable: true }), m());
      // ran-but-failed = Outcome.failed (D2), not Err, so the agent can react
      return raced.isErr() ? outcomeFail<ToolOutput>('failed', raced.error, m()) : outcomeOk(raced.value, m());
    }));
  }

  async observe(opts?: ObserveOptions): Promise<ModuleResult<Outcome<Observation>>> {
    if (this.disposed) return resultErr(domiaError(TOOLS, 'ALREADY_DISPOSED', 'session disposed'));
    // Only the target driver perceives; mounts add capability, not eyes.
    const observe = this.bindings.find((b) => b.observe)?.observe;
    if (!observe) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'no binding provides observe'));
    const started = new Date().toISOString();
    return resultOk(await this.tracer.withSpan('tool.observe', undefined, async (span) => {
      const r = await observe(opts);
      const m = metaSince(started, span.traceId, span.spanId);
      return r.isErr() ? outcomeFail<Observation>('failed', r.error, m) : outcomeOk(r.value, m);
    }));
  }

  async setHeaded(headed: boolean): Promise<ModuleResult<void>> {
    if (this.disposed) return resultErr(domiaError(TOOLS, 'ALREADY_DISPOSED', 'session disposed'));
    const flip = this.bindings.find((b) => b.setHeaded)?.setHeaded;
    if (!flip) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `target '${this.target.kind}' has no display to flip`));
    const r = await flip(headed);
    if (r.isOk()) this.headed = headed;
    return r;
  }

  async exportAuthState(): Promise<ModuleResult<string>> {
    if (this.disposed) return resultErr(domiaError(TOOLS, 'ALREADY_DISPOSED', 'session disposed'));
    const exp = this.bindings.find((b) => b.exportAuthState)?.exportAuthState;
    if (!exp) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `target '${this.target.kind}' has no auth state to export`));
    return exp();
  }

  async handoff(reason: string): Promise<ModuleResult<HumanHandback>> {
    const flipped = await this.setHeaded(true);
    if (flipped.isErr()) return resultErr(flipped.error);
    return resultOk({ note: `browser is headed for takeover: ${reason}` });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of this.bindings) await b.dispose();
  }
}
