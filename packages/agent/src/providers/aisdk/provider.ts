import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { AgentConfig, AgentContext, AgentProvider, ModelInfo, ModelRef, ModelSpec, ModuleResult, Tracer } from '@domia/contracts';
import { AiSdkAgentContext } from './context.js';

const AGENT = moduleId('agent');

const authErr = (variable: string): ModuleResult<LanguageModel> => resultErr(domiaError(AGENT, 'PROVIDER_AUTH', `${variable} not set`));

/** Every model a spec offers, in failover order (a single ref is a one-element chain). */
function chainOf(spec: ModelSpec): readonly ModelRef[] {
  return 'chain' in spec ? spec.chain : [spec];
}

/** One adapter over the Vercel AI SDK (E3). Providers: google, anthropic, openai, openai-compatible. */
export class AiSdkProvider implements AgentProvider {
  readonly id = 'aisdk';

  constructor(private readonly tracer: Tracer) {}

  async models(): Promise<ModuleResult<readonly ModelInfo[]>> {
    return resultOk([
      { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'google:gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'anthropic:claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'openai:gpt-4o', label: 'GPT-4o' },
      { id: 'openai:gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'openai-compatible:<model>', label: 'OpenAI-compatible — GitHub Models / Ollama / LM Studio / OpenRouter (set OPENAI_COMPATIBLE_BASE_URL)' },
    ]);
  }

  private resolveModel(ref: ModelRef): ModuleResult<LanguageModel> {
    switch (ref.provider) {
      case 'google':
        return process.env['GOOGLE_GENERATIVE_AI_API_KEY'] ? resultOk(createGoogleGenerativeAI()(ref.model)) : authErr('GOOGLE_GENERATIVE_AI_API_KEY');
      case 'anthropic':
        return process.env['ANTHROPIC_API_KEY'] ? resultOk(createAnthropic()(ref.model)) : authErr('ANTHROPIC_API_KEY');
      case 'openai':
        return process.env['OPENAI_API_KEY'] ? resultOk(createOpenAI()(ref.model)) : authErr('OPENAI_API_KEY');
      case 'openai-compatible': {
        const baseURL = process.env['OPENAI_COMPATIBLE_BASE_URL'];
        if (!baseURL) return resultErr(domiaError(AGENT, 'BAD_CONFIG', 'OPENAI_COMPATIBLE_BASE_URL not set (e.g. GitHub Models, Ollama, LM Studio, OpenRouter)'));
        const apiKey = process.env['OPENAI_COMPATIBLE_API_KEY'] ?? process.env['OPENAI_API_KEY'] ?? 'not-needed';
        return resultOk(createOpenAICompatible({ name: 'compat', baseURL, apiKey })(ref.model));
      }
      default:
        return resultErr(domiaError(AGENT, 'BAD_CONFIG', `unknown provider '${ref.provider}'`));
    }
  }

  async alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>> {
    const refs = chainOf(config.model);
    if (refs.length === 0) return resultErr(domiaError(AGENT, 'BAD_CONFIG', 'model chain is empty'));
    // Resolve each reachable model; a chain degrades past any whose key is missing.
    const models: LanguageModel[] = [];
    let lastErr = domiaError(AGENT, 'BAD_CONFIG', 'no model in the chain could be resolved');
    for (const ref of refs) {
      const m = this.resolveModel(ref);
      if (m.isOk()) models.push(m.value); else lastErr = m.error;
    }
    if (models.length === 0) return resultErr(lastErr);
    return resultOk(new AiSdkAgentContext(config, models, this.tracer));
  }
}
