import { extensionPoint } from './module.js';
import type { Tracer, TraceSink } from './trace.js';
import type { Store } from './store.js';
import type { ToolService, ToolProvider } from './tools.js';
import type { AgentService, AgentProvider } from './agent.js';
import type { CaseService } from './case.js';
import type { PlanService } from './plan.js';
import type { MemoryService } from './memory.js';
import type { SkillService } from './skills.js';
import type { LoopEngine, MetaToolHandler } from './loop.js';
import type { AuditService } from './audit.js';

/** The system's wiring map (D3). Kernel and modules resolve/register through these. */
export const EP = {
  Tracer: extensionPoint<Tracer>('trace.tracer', 'one'),
  TraceSink: extensionPoint<TraceSink>('trace.sink', 'many'),
  Store: extensionPoint<Store>('store.main', 'one'),
  ToolService: extensionPoint<ToolService>('tools.service', 'one'),
  ToolProvider: extensionPoint<ToolProvider>('tools.provider', 'many'),
  AgentService: extensionPoint<AgentService>('agent.service', 'one'),
  AgentProvider: extensionPoint<AgentProvider>('agent.provider', 'many'),
  CaseService: extensionPoint<CaseService>('case.service', 'one'),
  PlanService: extensionPoint<PlanService>('plan.service', 'one'),
  MemoryService: extensionPoint<MemoryService>('memory.service', 'one'),
  SkillService: extensionPoint<SkillService>('skills.service', 'one'),
  LoopEngine: extensionPoint<LoopEngine>('loop.engine', 'one'),
  MetaTool: extensionPoint<MetaToolHandler>('loop.metaTool', 'many'),
  AuditService: extensionPoint<AuditService>('audit.service', 'one'),
} as const;
