import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { HumanReply, ModuleResult, RunState } from '@domia/contracts';

const LOOP = moduleId('loop');

/**
 * The run's control surface: pause/resume/cancel and the human-input handshake.
 * Split out of LoopRun so the drive loop only asks two questions — "should I
 * stop?" and "may I proceed?" — and every user-authority concern lives here.
 */
export class RunControl {
  private readonly abort = new AbortController();
  private pausedGate: Promise<void> | null = null;
  private releasePause: (() => void) | null = null;
  private pendingHuman: ((r: ModuleResult<HumanReply>) => void) | null = null;
  private suspended = false;

  get signal(): AbortSignal { return this.abort.signal; }
  get isCancelled(): boolean { return this.abort.signal.aborted; }
  get isSuspended(): boolean { return this.suspended; }
  get isWaitingForHuman(): boolean { return this.pendingHuman !== null; }

  markSuspended(): void { this.suspended = true; }

  pause(): void {
    if (this.pausedGate) return;
    this.pausedGate = new Promise((r) => { this.releasePause = r; });
  }
  resume(): void {
    this.releasePause?.();
    this.pausedGate = null;
    this.releasePause = null;
  }
  cancel(reason: string): void {
    this.abort.abort(new Error(reason));
    this.resume(); // don't leave the loop parked behind a pause gate
    this.pendingHuman?.(resultErr(domiaError(LOOP, 'CANCELLED', reason)));
    this.pendingHuman = null;
  }

  /** Awaited between turns and between calls — cooperative, never mid-write. */
  async gate(): Promise<void> {
    if (this.pausedGate) await this.pausedGate;
  }

  /** Park until `answer()` resolves it. Caller decides the non-interactive path (D12). */
  awaitHuman(): Promise<ModuleResult<HumanReply>> {
    return new Promise((resolve) => { this.pendingHuman = resolve; });
  }

  answer(reply: HumanReply): ModuleResult<void> {
    const pending = this.pendingHuman;
    if (!pending) return resultErr(domiaError(LOOP, 'BAD_CONFIG', 'run is not waiting for input'));
    this.pendingHuman = null;
    pending(resultOk(reply));
    return resultOk(undefined);
  }

  /** Terminal reason if the loop must stop now, else null. */
  stopReason(state: RunState, maxTurns: number): 'cancelled' | 'suspended' | 'max_turns' | null {
    if (this.isCancelled) return 'cancelled';
    if (this.suspended) return 'suspended';
    if (state.turns >= maxTurns) return 'max_turns';
    return null;
  }
}
