import { z } from 'zod';
import { bootHeadless } from '@domia/hosts';
import { EP, brandId, metaSince } from '@domia/contracts';
import type { AgentConfig, AgentTurn, CallId, StepInput, ToolManifest, ToolOutput, Outcome } from '@domia/contracts';
import { parseModel } from '../parse.js';

const CLICK: ToolManifest = {
  name: 'browser.click',
  description: 'Click an element identified by its snapshot ref (e.g. e12).',
  parameters: z.object({ ref: z.string().describe('element ref like e12') }),
  output: z.unknown(),
  capabilities: ['dom'],
  risk: 'guarded',
};

function fakeToolResult(callId: CallId, name: string): { callId: CallId; name: string; outcome: Outcome<ToolOutput> } {
  const meta = metaSince(new Date().toISOString(), brandId<'TraceId'>('smoke'), brandId<'SpanId'>('smoke'));
  const value: ToolOutput = { value: 'Clicked. New page: Dashboard. Snapshot: - button "Log out" [ref=e20]' };
  return { callId, name, outcome: { status: 'ok', value, meta, toJSON: () => ({}) } };
}

/** Slice-2 smoke: a scripted 2-turn propose-only exchange against a real model. */
export async function agentSmoke(model: string): Promise<number> {
  const ref = parseModel(model);
  if (!ref.ok) { console.error(ref.error); return 1; }

  const boot = await bootHeadless();
  if (boot.isErr()) { console.error(boot.error.message); return 1; }
  const { kernel } = boot.value;
  const svc = kernel.resolve(EP.AgentService);
  if (svc.isErr()) { console.error(svc.error.message); await kernel.shutdown(); return 1; }

  const config: AgentConfig = {
    persona: brandId<'PersonaId'>('lead'),
    model: ref.ref,
    systemPrompt: 'You drive a web app. Act by calling tools with element refs from the snapshot. When the goal is met, reply with a short final summary and no tool call.',
    tools: [CLICK],
    auth: { kind: 'env', variable: 'GOOGLE_GENERATIVE_AI_API_KEY' },
    temperature: 0,
  };
  const ctxR = await svc.value.alloc(config);
  if (ctxR.isErr()) { console.error('alloc:', ctxR.error.message); await kernel.shutdown(); return 1; }
  const agent = ctxR.value;
  const goal: StepInput = { kind: 'goal', goal: 'Log in by clicking the login button.', observation: { snapshot: { kind: 'aria', text: '- button "Login" [ref=e12]' }, url: 'https://app.test/', title: 'Home', changedSinceLast: true } };
  let step = await agent.step(goal);
  if (step.isErr() || step.value.status !== 'ok') { console.error('step1:', step.isErr() ? step.error.message : 'failed'); await kernel.shutdown(); return 1; }
  printTurn(1, step.value.value);

  if (step.value.value.kind !== 'act') { console.error('expected an act turn (propose-only) but got', step.value.value.kind); await kernel.shutdown(); return 1; }
  const call = step.value.value.calls[0];
  if (!call) { console.error('act turn had no calls'); await kernel.shutdown(); return 1; }
  const results: StepInput = { kind: 'toolResults', results: [fakeToolResult(brandId<'CallId'>('c1'), call.name)], observation: { snapshot: { kind: 'aria', text: '- button "Log out" [ref=e20]' }, url: 'https://app.test/dashboard', title: 'Dashboard', changedSinceLast: true } };
  step = await agent.step(results);
  if (step.isErr() || step.value.status !== 'ok') { console.error('step2:', step.isErr() ? step.error.message : 'failed'); await kernel.shutdown(); return 1; }
  printTurn(2, step.value.value);

  console.log('\n✓ propose-only exchange complete (act → toolResults → final).');
  await agent.dispose();
  await kernel.shutdown();
  return 0;
}

function printTurn(n: number, turn: AgentTurn): void {
  if (turn.kind === 'act') console.log(`\nturn ${n}: ACT — ${turn.calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(', ')}${turn.thought ? `\n  thought: ${turn.thought.slice(0, 120)}` : ''}`);
  else if (turn.kind === 'final') console.log(`\nturn ${n}: FINAL — ${turn.summary.slice(0, 200)}`);
  else console.log(`\nturn ${n}: ASK — ${turn.question}`);
}
