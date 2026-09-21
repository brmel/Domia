import type {
  AgentService, CaseContext, MemoryService, MetaToolHandler, ModelSpec, PersonaId, PlanService, RunOptions, Store,
  ToolService, ToolsetSelector, Tracer,
} from '@domia/contracts';
import type { InformantThresholds } from './informants.js';

/** Everything a run is constructed from. One shape, shared by engine → run → assemble. */
export interface RunDeps {
  readonly caseCtx: CaseContext;
  readonly request: string;
  readonly options: RunOptions;
  readonly persona: PersonaId;
  readonly model: ModelSpec;
  readonly systemPrompt: string;
  readonly nudgeAsk: string;
  readonly thresholds: InformantThresholds;
  readonly toolsetSelector: ToolsetSelector;
  readonly maxTurns: number;
  readonly agentSvc: AgentService;
  readonly toolSvc: ToolService;
  readonly planSvc: PlanService;
  readonly memorySvc: MemoryService;
  readonly tracer: Tracer;
  readonly store: Store;
  readonly metaHandlers: readonly MetaToolHandler[];
}
