import { domiaError, moduleId, outcomeOk, outcomeFail, metaSince } from '@domia/contracts';
import type {
  Observation, Outcome, RunEvent, RunId, RunReport, StepInput, TokenUsage, ToolOutput, ToolResultLine, Tracer,
} from '@domia/contracts';
import type { RunControl } from './control.js';
import type { RunJournal } from './journal.js';
import type { RunResources } from './assemble.js';
import { informants, type InformantThresholds } from './informants.js';

const LOOP = moduleId('loop');

export interface DriveDeps {
  readonly runId: RunId;
  readonly request: string;
  readonly maxTurns: number;
  readonly tracer: Tracer;
  readonly control: RunControl;
  readonly journal: RunJournal;
  readonly resources: RunResources;
  readonly memory?: readonly string[];
  readonly nudgeAsk: string;
  readonly thresholds: InformantThresholds;
  onTurn(): void;
  turns(): number;
  emit(e: RunEvent): void;
}

/**
 * THE mediated loop: observe → step → route → repeat → final.
 * Every agent↔tool exchange passes through here; nothing else in the system may
 * execute a tool. Control lives in RunControl, bookkeeping in RunJournal — this
 * file only decides what happens next.
 */
export async function drive(d: DriveDeps): Promise<Outcome<RunReport>> {
  const { control, journal, resources } = d;
  const { agent, session, plan, router } = resources;
  const started = new Date().toISOString();
  let inTok = 0;
  let outTok = 0;
  let calls = 0;
  const usage = (): TokenUsage => ({ input: inTok, output: outTok });

  return d.tracer.withSpan('run', { request: d.request, runId: d.runId }, async (span) => {
    const meta = () => metaSince(started, span.traceId, span.spanId, { cost: usage() });
    const stats = () => ({ turns: d.turns(), calls, usage: usage(), durationMs: Date.now() - Date.parse(started) });
    const stop = (status: Exclude<Outcome<RunReport>['status'], 'ok'>, message: string): Outcome<RunReport> => {
      span.end(status);
      return outcomeFail(status, domiaError(LOOP, status === 'cancelled' ? 'CANCELLED' : status === 'suspended' ? 'SUSPENDED' : 'TOOL_FAILED', message), meta());
    };

    const first = await session.observe();
    let observation: Observation | undefined = first.isOk() && first.value.status === 'ok' ? first.value.value : undefined;
    let input: StepInput = { kind: 'goal', goal: d.request, ...(observation ? { observation } : {}), ...(d.memory?.length ? { memory: d.memory } : {}) };
    let noProgress = 0;
    let failStreak = 0;

    for (;;) {
      await control.gate();
      const reason = control.stopReason({ status: 'running', turns: d.turns() }, d.maxTurns);
      if (reason === 'cancelled') return stop('cancelled', 'run cancelled');
      if (reason === 'suspended') return stop('suspended', 'run suspended');
      if (reason === 'max_turns') return stop('failed', `max turns (${d.maxTurns}) reached`);

      const stepR = await agent.step(input, control.signal);
      if (stepR.isErr()) { span.end('failed', stepR.error); return outcomeFail('failed', stepR.error, meta()); }
      const stepOutcome = stepR.value;
      if (stepOutcome.status !== 'ok') { span.end(stepOutcome.status); return outcomeFail(stepOutcome.status, stepOutcome.error, meta()); }
      if (stepOutcome.meta.cost) { inTok += stepOutcome.meta.cost.input; outTok += stepOutcome.meta.cost.output; }

      const turn = stepOutcome.value;
      d.onTurn();
      await journal.recordTurn(turn, d.turns(), stepOutcome.meta.cost);

      if (turn.kind === 'final') {
        span.addCost(usage());
        span.end('ok');
        return outcomeOk<RunReport>({
          summary: turn.summary,
          ...(turn.verdict ? { verdict: turn.verdict } : {}),
          ...(turn.value !== undefined ? { value: turn.value } : {}),
          plan: plan.current(),
          stats: stats(),
        }, meta());
      }
      if (turn.kind === 'ask') {
        // A bare 'ask' turn means the model talked instead of calling user.ask.
        input = { kind: 'user', message: d.nudgeAsk };
        continue;
      }

      const results: ToolResultLine[] = [];
      for (const proposed of turn.calls) {
        if (control.isCancelled) break;
        await control.gate();
        const call = router.stamp(proposed);
        const routed = await router.route(call, control.signal);
        calls++;
        const outcome: Outcome<ToolOutput> = routed.isOk() ? routed.value : outcomeFail('failed', routed.error, meta());
        await journal.recordCall(call, outcome);
        results.push({ callId: call.callId, name: call.name, outcome });
        if (outcome.status === 'suspended') { control.markSuspended(); break; }
        // D6 — the fresh observation rides the tool result; no extra observe call.
        if (outcome.status === 'ok' && outcome.value.observation) observation = outcome.value.observation;
      }
      // Advisory informants (never a stop), folded into the next input + surfaced as events.
      const inf = informants({ results, ...(observation ? { observation } : {}), stale: plan.staleness(), tokensUsed: inTok + outTok }, { failStreak, noProgress }, d.thresholds);
      failStreak = inf.state.failStreak;
      noProgress = inf.state.noProgress;
      for (const s of inf.signals) d.emit({ type: 'signal', runId: d.runId, signal: s });
      input = { kind: 'toolResults', results, ...(observation ? { observation } : {}), ...(inf.signals.length ? { signals: inf.signals } : {}) };
    }
  });
}
