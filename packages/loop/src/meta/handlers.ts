import { z } from 'zod';
import { resultOk, outcomeOk, outcomeFail, domiaError, moduleId } from '@domia/contracts';
import type { LoopRunInternals, LoopRunView, MetaToolHandler, ModuleResult, Outcome, ToolCall, ToolManifest, ToolOutput } from '@domia/contracts';
import { syntheticMeta } from './meta.js';

const LOOP = moduleId('loop');

/** user.ask — ask the human a question; parks the run until answered (or degrades, D12). */
export const askHandler: MetaToolHandler = {
  manifests(view: LoopRunView): readonly ToolManifest[] {
    if (view.options.questions === 'never') return []; // removed when unattended
    return [{ name: 'user.ask', description: 'Ask the user a question you cannot infer (intent/constraints only, never how-to). The run pauses for their reply.', parameters: z.object({ question: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' }];
  },
  async dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const reply = await run.requestHuman(String(call.args['question']), 'ask');
    if (reply.isErr()) return resultOk(outcomeFail<ToolOutput>('failed', reply.error, syntheticMeta()));
    const text = reply.value.kind === 'answer' ? reply.value.text : reply.value.kind;
    return resultOk(outcomeOk<ToolOutput>({ value: { answer: text } }, syntheticMeta()));
  },
};

/** suspend — snapshot the conversation and stop; resume later with `domia run resume`. */
export const suspendHandler: MetaToolHandler = {
  manifests(): readonly ToolManifest[] {
    return [{ name: 'suspend', description: 'Pause the run and persist your state. Use when blocked on something only available later. Resumes on demand.', parameters: z.object({ reason: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' }];
  },
  async dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const r = await run.suspend(String(call.args['reason']));
    if (r.isErr()) return resultOk(outcomeFail<ToolOutput>('failed', r.error, syntheticMeta()));
    return resultOk(outcomeFail<ToolOutput>('suspended', domiaError(LOOP, 'SUSPENDED', String(call.args['reason'])), syntheticMeta()));
  },
};

/** context.handoff — hand the target to the human to drive directly; resumes on confirm (R2). */
export const handoffHandler: MetaToolHandler = {
  manifests(view: LoopRunView): readonly ToolManifest[] {
    if (view.options.questions === 'never') return []; // unattended runs can't hand off to a human
    return [{ name: 'context.handoff', description: 'Hand control of the target to the human to do something you cannot (a captcha, a login, a payment). The run pauses until they confirm they are done, then you continue.', parameters: z.object({ reason: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' }];
  },
  async dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const reason = String(call.args['reason']);
    const wasHeaded = run.session.inspect().headed;
    const shown = !wasHeaded ? await run.session.setHeaded(true) : undefined;
    const visible = shown === undefined || shown.isOk();
    const reply = await run.requestHuman(reason, 'takeover');
    if (visible && !wasHeaded) await run.session.setHeaded(false);
    if (reply.isErr()) return resultOk(outcomeFail<ToolOutput>('failed', reply.error, syntheticMeta()));
    const note = reply.value.kind === 'takeover_done' ? reply.value.note : undefined;
    return resultOk(outcomeOk<ToolOutput>({
      value: { resumed: true, headedForHuman: visible, ...(note ? { note } : {}) },
    }, syntheticMeta()));
  },
};

export const builtinMetaHandlers: readonly MetaToolHandler[] = [askHandler, suspendHandler, handoffHandler];
