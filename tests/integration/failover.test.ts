import { describe, it, expect, afterEach } from 'vitest';
import { EP, brandId } from '@domia/contracts';
import type { AgentConfig, ModelSpec } from '@domia/contracts';
import { AiSdkProvider, parseModelSpec } from '@domia/agent';
import { bootTest, must, type Harness } from './harness.js';

const GOOGLE_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY';
const OPENAI_KEY = 'OPENAI_API_KEY';

function agentConfig(model: ModelSpec): AgentConfig {
  return { persona: brandId<'PersonaId'>('lead'), model, systemPrompt: 'test', tools: [], auth: { kind: 'none' } };
}

describe('R7: model chains across providers', () => {
  let h: Harness | undefined;
  const originalGoogle = process.env[GOOGLE_KEY];
  const originalOpenai = process.env[OPENAI_KEY];

  afterEach(async () => {
    await h?.dispose();
    h = undefined;
    if (originalGoogle === undefined) delete process.env[GOOGLE_KEY]; else process.env[GOOGLE_KEY] = originalGoogle;
    if (originalOpenai === undefined) delete process.env[OPENAI_KEY]; else process.env[OPENAI_KEY] = originalOpenai;
  });

  it('reads a comma-separated chain, keeping failover order', () => {
    expect(must(parseModelSpec('google:gemini-2.5-flash'))).toEqual({ provider: 'google', model: 'gemini-2.5-flash' });
    expect(must(parseModelSpec('openai:gpt-4o, google:gemini-2.5-flash'))).toEqual({
      chain: [{ provider: 'openai', model: 'gpt-4o' }, { provider: 'google', model: 'gemini-2.5-flash' }],
    });
    expect(parseModelSpec('nonsense').isErr()).toBe(true);
  });

  it('allocs a chain whose first provider has no key, and refuses one where none do', async () => {
    h = await bootTest();
    const tracer = h.resolve(EP.Tracer);
    const provider = new AiSdkProvider(tracer);

    delete process.env[OPENAI_KEY];
    process.env[GOOGLE_KEY] = 'test-key-not-used-for-network';
    const degraded = await provider.alloc(agentConfig({ chain: [{ provider: 'openai', model: 'gpt-4o' }, { provider: 'google', model: 'gemini-2.5-flash' }] }));
    const ctx = must(degraded);
    expect(ctx.inspect().turnCount).toBe(0);
    await ctx.dispose();

    delete process.env[GOOGLE_KEY];
    const unreachable = await provider.alloc(agentConfig({ chain: [{ provider: 'openai', model: 'gpt-4o' }, { provider: 'google', model: 'gemini-2.5-flash' }] }));
    expect(unreachable.isErr()).toBe(true);
    if (unreachable.isErr()) expect(unreachable.error.code).toBe('PROVIDER_AUTH');
  });
});
