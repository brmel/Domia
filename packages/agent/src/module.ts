import { resultErr, resultOk, domiaError, moduleId, EP } from '@domia/contracts';
import type { AgentConfig, AgentContext, AgentProvider, AgentService, DomiaModule, ModelInfo, ModelRef, ModuleHost, ModuleResult, ProviderInfo } from '@domia/contracts';
import { AiSdkProvider } from './providers/aisdk/provider.js';
import { ReplayProvider } from './providers/replay/provider.js';

const AGENT = moduleId('agent');

function providerOf(config: AgentConfig): string {
  const ref: ModelRef | undefined = 'chain' in config.model ? config.model.chain[0] : config.model;
  return ref?.provider === 'replay' ? 'replay' : 'aisdk';
}

class AgentServiceImpl implements AgentService {
  constructor(private readonly byId: Map<string, AgentProvider>) {}
  providers(): readonly ProviderInfo[] { return [...this.byId.keys()].map((id) => ({ id })); }
  async models(providerId: string): Promise<ModuleResult<readonly ModelInfo[]>> {
    const p = this.byId.get(providerId);
    if (!p) return resultErr(domiaError(AGENT, 'NOT_FOUND', `no agent provider '${providerId}'`));
    return p.models();
  }
  async alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>> {
    const p = this.byId.get(providerOf(config));
    if (!p) return resultErr(domiaError(AGENT, 'NOT_FOUND', `no provider for model`));
    return p.alloc(config);
  }
}

export interface AgentModuleOptions {
  /**
   * Scripted turns for the `replay` provider. This is the deterministic seam: the
   * loop, tools, plan, trace and store all run for real while the model is replaced
   * by recorded turns — no LLM cost, no quota, no flake. Used by integration tests.
   */
  readonly replay?: (config: AgentConfig) => readonly import('@domia/contracts').AgentTurn[];
}

export function agentModule(opts: AgentModuleOptions = {}): DomiaModule {
  return {
    manifest: { id: AGENT, version: '0.0.0', provides: [EP.AgentService, EP.AgentProvider], requires: [moduleId('trace')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const providers: AgentProvider[] = [new AiSdkProvider(host.tracer)];
      if (opts.replay) providers.push(new ReplayProvider(opts.replay, host.tracer));
      const byId = new Map<string, AgentProvider>();
      for (const p of providers) {
        const r = host.register(EP.AgentProvider, p);
        if (r.isErr()) return r;
        byId.set(p.id, p);
      }
      const reg = host.register(EP.AgentService, new AgentServiceImpl(byId));
      if (reg.isErr()) return reg;
      host.logger.info('agent ready', { providers: [...byId.keys()] });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
