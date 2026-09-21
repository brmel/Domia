import { newId } from '@domia/kernel';
import { z } from 'zod';
import { generateText, stepCountIs, tool, type ModelMessage, type LanguageModel, type ToolSet } from 'ai';
import { resultErr, resultOk, domiaError, moduleId, brandId, outcomeOk, metaSince } from '@domia/contracts';
import type {
  AgentConfig, AgentContext, AgentState, AgentStreamEvent, AgentTurn, CancelSignal, ContextId,
  ConversationSnapshot, ModuleResult, Observation, Outcome, ProposedCall, StepInput, TokenUsage, Tracer,
} from '@domia/contracts';
import { NameMap } from './names.js';

const AGENT = moduleId('agent');
const PROVIDER = 'aisdk';
const FINISH = 'finish';
const finishTool = tool({
  description: 'Call this when the task is complete. Give a concise summary of the outcome or answer; include a verdict only if the task was a pass/fail check.',
  inputSchema: z.object({ summary: z.string(), verdict: z.enum(['pass', 'fail']).optional() }),
});

function obsText(o: Observation): string {
  return [o.url ? `URL: ${o.url}` : '', o.title ? `Title: ${o.title}` : '', 'Snapshot:', o.snapshot.text].filter(Boolean).join('\n');
}

export class AiSdkAgentContext implements AgentContext {
  readonly id: ContextId = brandId<'ContextId'>(newId(12));
  private config: AgentConfig;
  private readonly names: NameMap;
  private messages: ModelMessage[] = [];
  private lastCalls: { toolCallId: string; toolName: string }[] = [];
  private turnCount = 0;
  private usage: TokenUsage = { input: 0, output: 0 };
  private modelIndex = 0;

  // `models` is the failover chain (a single model is a one-element chain). On a
  // provider error (auth / quota / 5xx) step() advances to the next and retries (R7).
  constructor(config: AgentConfig, private readonly models: readonly LanguageModel[], private readonly tracer: Tracer) {
    this.config = config;
    this.names = new NameMap(config.tools);
  }

  configure(patch: Partial<AgentConfig>): ModuleResult<void> {
    this.config = { ...this.config, ...patch };
    return resultOk(undefined);
  }
  inspect(): Readonly<AgentConfig & AgentState> {
    return { ...this.config, turnCount: this.turnCount, usage: this.usage };
  }

  private generate(signal?: CancelSignal): ReturnType<typeof generateText> {
    return generateText({
      model: this.models[this.modelIndex]!,
      system: this.config.systemPrompt,
      messages: this.messages,
      tools: this.toolSet(),
      stopWhen: stepCountIs(1),
      ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
      // D25 — Gemini's default "thinking" can consume the whole output budget on large
      // tool+snapshot inputs, returning an empty response. Disable it for tool-driving
      // unless a thinking budget was explicitly configured. (Namespaced; other providers ignore it.)
      providerOptions: { google: { thinkingConfig: { thinkingBudget: this.config.thinking?.budgetTokens ?? 0 } } },
      ...(signal ? { abortSignal: signal } : {}),
    });
  }

  private toolSet(): ToolSet {
    const out: Record<string, unknown> = {};
    for (const m of this.config.tools) {
      // No execute → the SDK returns the call instead of running it (propose-only, E3).
      out[this.names.sanitized(m.name)] = tool({ description: m.description, inputSchema: m.parameters });
    }
    // A first-class finish tool: real models terminate by calling it, not by
    // emitting bare text. The provider maps it to a `final` turn (D5), never executes it.
    out[FINISH] = finishTool;
    return out as ToolSet;
  }

  private appendInput(input: StepInput): void {
    // D20 — AI SDK v7 takes the system prompt as the `system` option, not a message.
    if (input.kind === 'goal') {
      const mem = input.memory?.length ? `\n\nRelevant memory:\n${input.memory.join('\n')}` : '';
      const obs = input.observation ? `\n\nCurrent state:\n${obsText(input.observation)}` : '';
      this.messages.push({ role: 'user', content: `${input.goal}${mem}${obs}` });
    } else if (input.kind === 'toolResults') {
      this.messages.push({
        role: 'tool',
        content: input.results.map((r, i) => ({
          type: 'tool-result' as const,
          toolCallId: this.lastCalls[i]?.toolCallId ?? r.callId,
          toolName: this.lastCalls[i]?.toolName ?? this.names.sanitized(r.name),
          output: { type: 'text' as const, value: r.outcome.status === 'ok' ? JSON.stringify(r.outcome.value.value).slice(0, 4000) : `ERROR: ${r.outcome.error.message}` },
        })),
      });
      const parts: string[] = [];
      if (input.observation) parts.push(`Current state:\n${obsText(input.observation)}`);
      if (input.signals?.length) parts.push(`Signals: ${input.signals.map((s) => s.message).join('; ')}`);
      if (parts.length) this.messages.push({ role: 'user', content: parts.join('\n\n') });
    } else if (input.kind === 'user') {
      this.messages.push({ role: 'user', content: input.message });
    } else {
      this.messages.push({ role: 'user', content: `Signals: ${input.signals.map((s) => s.message).join('; ')}` });
    }
  }

  private async attachVision(input: StepInput): Promise<void> {
    const obs = input.kind === 'goal' || input.kind === 'toolResults' ? input.observation : undefined;
    if (!obs?.screenshot || !this.config.readArtifact) return;
    const bytes = await this.config.readArtifact(obs.screenshot);
    if (bytes) this.messages.push({ role: 'user', content: [{ type: 'image', image: bytes, mediaType: obs.screenshot.mime }] });
  }

  async step(input: StepInput, signal?: CancelSignal): Promise<ModuleResult<Outcome<AgentTurn>>> {
    if (signal?.aborted) return resultErr(domiaError(AGENT, 'CANCELLED', 'cancelled before step'));
    const started = new Date().toISOString();
    this.appendInput(input);
    await this.attachVision(input);
    return this.tracer.withSpan('agent.step', { turn: this.turnCount + 1 }, async (span) => {
      let res: Awaited<ReturnType<typeof generateText>>;
      for (;;) {
        try {
          res = await this.generate(signal);
          // D25 — some models occasionally return an empty response (no text, no call).
          // That is a flake, not a completion; retry once before trusting it.
          if (res.toolCalls.length === 0 && res.text.trim() === '') res = await this.generate(signal);
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const auth = /api key|unauthor|permission|denied/i.test(msg);
          // R7 — fail over to the next model in the chain on a provider error, then retry.
          if (this.modelIndex + 1 < this.models.length) { this.modelIndex++; continue; }
          span.end('failed');
          return resultErr(domiaError(AGENT, auth ? 'PROVIDER_AUTH' : 'PROVIDER_UNAVAILABLE', msg, { retryable: !auth }));
        }
      }

      this.turnCount++;
      const usage: TokenUsage = { input: res.usage.inputTokens ?? 0, output: res.usage.outputTokens ?? 0 };
      this.usage = { input: this.usage.input + usage.input, output: this.usage.output + usage.output };
      span.addCost(usage);
      this.messages.push(...res.response.messages);
      const meta = metaSince(started, span.traceId, span.spanId, { cost: usage });

      const finish = res.toolCalls.find((c) => c.toolName === FINISH);
      if (finish) {
        this.lastCalls = [];
        const args = (finish.input ?? {}) as { summary?: string; verdict?: 'pass' | 'fail' };
        return resultOk(outcomeOk({ kind: 'final', summary: args.summary ?? res.text ?? '', ...(args.verdict ? { verdict: args.verdict } : {}) } satisfies AgentTurn, meta));
      }
      if (res.toolCalls.length > 0) {
        this.lastCalls = res.toolCalls.map((c) => ({ toolCallId: c.toolCallId, toolName: c.toolName }));
        const calls: ProposedCall[] = res.toolCalls.map((c) => ({ name: this.names.original(c.toolName), args: (c.input ?? {}) as Record<string, unknown> }));
        const turn: AgentTurn = { kind: 'act', calls, ...(res.text ? { thought: res.text } : {}) };
        return resultOk(outcomeOk(turn, meta));
      }
      this.lastCalls = [];
      // No tool call → treat the text as the final answer (fallback).
      return resultOk(outcomeOk({ kind: 'final', summary: res.text } satisfies AgentTurn, meta));
    });
  }

  // Token streaming is unused: the loop drives turn-at-a-time via step(). Kept to satisfy the contract.
  async *stream(): AsyncIterable<AgentStreamEvent> {}

  async fork(): Promise<ModuleResult<AgentContext>> {
    const clone = new AiSdkAgentContext(this.config, this.models, this.tracer);
    clone.messages = [...this.messages];
    return resultOk(clone);
  }

  async snapshot(): Promise<ModuleResult<ConversationSnapshot>> {
    return resultOk({ provider: PROVIDER, version: '1', blob: { messages: this.messages, lastCalls: this.lastCalls } });
  }
  async restore(s: ConversationSnapshot): Promise<ModuleResult<void>> {
    if (s.provider !== PROVIDER) return resultErr(domiaError(AGENT, 'BAD_CONFIG', `snapshot from '${s.provider}', not '${PROVIDER}'`));
    const b = s.blob as { messages: ModelMessage[]; lastCalls: { toolCallId: string; toolName: string }[] };
    this.messages = b.messages;
    this.lastCalls = b.lastCalls;
    return resultOk(undefined);
  }

  async dispose(): Promise<void> { this.messages = []; }
}
