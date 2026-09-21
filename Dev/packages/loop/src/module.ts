import { resultOk, resultErr, moduleId, EP } from '@domia/contracts';
import type { DomiaModule, ModelSpec, ModuleHost, ModuleResult } from '@domia/contracts';
import { LoopEngineImpl } from './engine.js';
import { PersonaRegistry } from './personas.js';
import { builtinMetaHandlers } from './meta/handlers.js';
import { SubRunCoordinator } from './meta/subruns.js';
import { thresholdsFrom } from './informants.js';

export interface LoopModuleOptions {
  readonly promptsDir: string;
  readonly defaultModel: ModelSpec;
}

export function loopModule(opts: LoopModuleOptions): DomiaModule {
  return {
    manifest: {
      id: moduleId('loop'),
      version: '0.0.0',
      provides: [EP.LoopEngine, EP.MetaTool],
      requires: [moduleId('trace'), moduleId('store'), moduleId('tools'), moduleId('agent'), moduleId('plan'), moduleId('case')],
    },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const agentSvc = host.resolve(EP.AgentService);
      if (agentSvc.isErr()) return resultErr(agentSvc.error);
      const toolSvc = host.resolve(EP.ToolService);
      if (toolSvc.isErr()) return resultErr(toolSvc.error);
      const planSvc = host.resolve(EP.PlanService);
      if (planSvc.isErr()) return resultErr(planSvc.error);
      const memorySvc = host.resolve(EP.MemoryService);
      if (memorySvc.isErr()) return resultErr(memorySvc.error);
      const store = host.resolve(EP.Store);
      if (store.isErr()) return resultErr(store.error);

      // Built-ins go through the same extension point as anyone else's belt tools.
      for (const handler of builtinMetaHandlers) {
        const r = host.register(EP.MetaTool, handler);
        if (r.isErr()) return r;
      }

      const engine = new LoopEngineImpl(
        { agentSvc: agentSvc.value, toolSvc: toolSvc.value, planSvc: planSvc.value, memorySvc: memorySvc.value, tracer: host.tracer, store: store.value },
        new PersonaRegistry(opts.promptsDir),
        opts.defaultModel,
        () => host.resolveAll(EP.MetaTool).unwrapOr([]),
        thresholdsFrom(host.config),
      );
      const reg = host.register(EP.LoopEngine, engine);
      if (reg.isErr()) return reg;

      // Sub-runs need the engine to launch children; register after it exists so
      // the per-run resolveAll(EP.MetaTool) picks it up like any other belt tool.
      const subruns = host.register(EP.MetaTool, new SubRunCoordinator(() => engine));
      if (subruns.isErr()) return subruns;

      host.logger.info('loop ready');
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
