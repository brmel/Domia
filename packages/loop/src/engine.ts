import { resultOk, brandId } from '@domia/contracts';
import type {
  AgentService, LoopEngine, LoopRun, MemoryService, MetaToolHandler, ModelSpec, ModuleResult, Persona,
  PersonaId, PlanService, RunBinding, Store, ToolService, Tracer,
} from '@domia/contracts';
import { LoopRunImpl } from './run.js';
import { PersonaRegistry } from './personas.js';
import type { InformantThresholds } from './informants.js';

export interface EngineServices {
  readonly agentSvc: AgentService;
  readonly toolSvc: ToolService;
  readonly planSvc: PlanService;
  readonly memorySvc: MemoryService;
  readonly tracer: Tracer;
  readonly store: Store;
}

const DEFAULT_MAX_TURNS = 24;

export class LoopEngineImpl implements LoopEngine {
  private readonly extraHandlers: MetaToolHandler[] = [];

  constructor(
    private readonly services: EngineServices,
    private readonly personas_: PersonaRegistry,
    private readonly defaultModel: ModelSpec,
    /** Resolved per run, so belt tools registered after the loop still count. */
    private readonly registeredMeta: () => readonly MetaToolHandler[],
    private readonly thresholds: InformantThresholds,
  ) {}

  registerMetaTool(h: MetaToolHandler): void { this.extraHandlers.push(h); }

  private metaHandlersFor(): readonly MetaToolHandler[] {
    return [...this.registeredMeta(), ...this.extraHandlers];
  }
  personas(): readonly Persona[] { return this.personas_.list(); }

  async alloc(binding: RunBinding): Promise<ModuleResult<LoopRun>> {
    const options = binding.options ?? {};
    const personaId: PersonaId = options.persona ?? brandId<'PersonaId'>('lead');
    const override = options.personaOverrides?.[String(personaId)];
    const persona = this.personas_.resolve(personaId, override);
    const run = new LoopRunImpl({
      caseCtx: binding.caseCtx,
      request: binding.request,
      options,
      persona: personaId,
      model: persona.model ?? this.defaultModel,
      systemPrompt: persona.systemPrompt,
      nudgeAsk: this.personas_.system('nudge-ask'),
      thresholds: this.thresholds,
      toolsetSelector: persona.toolset,
      maxTurns: options.budgetHints?.maxTurns ?? DEFAULT_MAX_TURNS,
      agentSvc: this.services.agentSvc,
      toolSvc: this.services.toolSvc,
      planSvc: this.services.planSvc,
      memorySvc: this.services.memorySvc,
      tracer: this.services.tracer,
      store: this.services.store,
      metaHandlers: this.metaHandlersFor(),
    });
    return resultOk(run);
  }
}
