import { brandId } from '@domia/contracts';
import type { AgentConfig, AgentProvider, AgentTurn, ModuleResult } from '@domia/contracts';
import { suite, testCase, assert, type TestSuite } from './kit.js';

function must<T>(r: ModuleResult<T>, what: string): T {
  assert(r.isOk(), `${what}: expected Ok, got ${r.isErr() ? r.error.code : '??'}`);
  return (r as { value: T }).value;
}

function assertTurn(t: AgentTurn): void {
  assert(['act', 'ask', 'final'].includes(t.kind), `turn.kind must be act|ask|final, got '${t.kind}'`);
  if (t.kind === 'act') {
    assert(Array.isArray(t.calls), 'act.calls must be an array');
    // D5 — propose-only: an act turn carries ProposedCalls, not executed results.
    for (const c of t.calls) assert(typeof c.name === 'string' && typeof c.args === 'object' && c.args !== null, 'each act call must be a ProposedCall {name,args}');
  }
  if (t.kind === 'final') assert(typeof t.summary === 'string', 'final.summary must be a string');
  if (t.kind === 'ask') assert(typeof t.question === 'string', 'ask.question must be a string');
}

/** Every AgentProvider — AiSdk, Replay, third-party — must pass this behaviorally. */
export function agentProviderKit(make: () => AgentProvider): TestSuite {
  const configFor = async (p: AgentProvider): Promise<AgentConfig> => {
    const models = await p.models();
    const first = models.isOk() ? models.value[0]?.id : undefined;
    return { persona: brandId<'PersonaId'>('conformance'), model: { provider: p.id, model: first ?? 'default' }, systemPrompt: 'You are under test.', tools: [], auth: { kind: 'none' }, temperature: 0 };
  };

  return suite('AgentProvider', [
    testCase('advertises at least one model', async () => {
      const m = await make().models();
      assert(m.isOk() && m.value.length > 0, 'models() must return Ok with ≥1 model');
    }),
    testCase('allocates a context and takes a well-formed first step (D5 propose-only)', async () => {
      const p = make();
      const ctx = must(await p.alloc(await configFor(p)), 'alloc');
      const step = await ctx.step({ kind: 'goal', goal: 'State that you are done.' });
      assert(step.isOk(), 'step must return Ok(Outcome)');
      const o = step.value;
      assert(o.status === 'ok', `first step outcome should be ok, got '${o.status}'`);
      assertTurn(o.value);
      await ctx.dispose();
    }),
    testCase('snapshot then restore round-trips within the provider (D10)', async () => {
      const p = make();
      const ctx = must(await p.alloc(await configFor(p)), 'alloc');
      const snap = must(await ctx.snapshot(), 'snapshot');
      assert(typeof snap.provider === 'string' && snap.provider.length > 0, 'snapshot is provider-tagged');
      const restored = await ctx.restore(snap);
      assert(restored.isOk(), 'restore of own snapshot must succeed');
      await ctx.dispose();
    }),
  ]);
}
