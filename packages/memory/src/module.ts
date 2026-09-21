import { join } from 'node:path';
import { z } from 'zod';
import { resultOk, resultErr, domiaError, moduleId, EP, outcomeOk, metaSince, brandId } from '@domia/contracts';
import type {
  CaseId, DomiaModule, MemoryCard, MemoryId, MemoryService, ModuleHost, ModuleResult, Outcome, ToolCall,
  ToolManifest, ToolOutput, Tracer,
} from '@domia/contracts';
import { MemoryStore } from './store.js';
import { selectRelevant } from './select.js';

const MEMORY = moduleId('memory');

const TOOLS: readonly ToolManifest[] = [
  { name: 'memory.save', description: 'Remember something durable about this target for future runs (a quirk, a path, a credential location — never a secret value).', parameters: z.object({ title: z.string(), text: z.string(), tags: z.array(z.string()).optional() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'memory.recall', description: 'Search your memories about this target.', parameters: z.object({ query: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'memory.list', description: 'List everything you remember about this target.', parameters: z.object({}), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
];

class MemoryServiceImpl implements MemoryService {
  constructor(private readonly store: MemoryStore, private readonly tracer: Tracer) {}

  async relevant(caseId: CaseId, request: string): Promise<ModuleResult<readonly MemoryCard[]>> {
    const all = await this.store.list(caseId);
    if (all.isErr()) return resultErr(all.error);
    return resultOk(selectRelevant(all.value, request));
  }

  toolManifests(_caseId: CaseId): readonly ToolManifest[] { return TOOLS; }

  async dispatch(caseId: CaseId, call: ToolCall): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const started = new Date().toISOString();
    return resultOk(await this.tracer.withSpan('memory.tool', { tool: call.name }, async (span) => {
      const meta = metaSince(started, span.traceId, span.spanId);
      const fail = (msg: string): Outcome<ToolOutput> => ({ status: 'failed', error: domiaError(MEMORY, 'TOOL_FAILED', msg), meta, toJSON: () => ({}) });

      switch (call.name) {
        case 'memory.save': {
          const r = await this.store.save(caseId, {
            title: String(call.args['title'] ?? ''),
            body: String(call.args['text'] ?? ''),
            ...(Array.isArray(call.args['tags']) ? { tags: (call.args['tags'] as string[]).map(String) } : {}),
          });
          return r.isErr() ? fail(r.error.message) : outcomeOk<ToolOutput>({ value: { saved: r.value.id, title: r.value.title } }, meta);
        }
        case 'memory.recall': {
          const all = await this.store.list(caseId);
          if (all.isErr()) return fail(all.error.message);
          const hits = selectRelevant(all.value, String(call.args['query'] ?? ''));
          return outcomeOk<ToolOutput>({ value: { memories: hits.map((c) => ({ title: c.title, tags: c.tags, body: c.body })) } }, meta);
        }
        case 'memory.list': {
          const all = await this.store.list(caseId);
          if (all.isErr()) return fail(all.error.message);
          return outcomeOk<ToolOutput>({ value: { memories: all.value.map((c) => ({ id: c.id, title: c.title, tags: c.tags })) } }, meta);
        }
        default:
          return fail(`memory has no tool '${call.name}'`);
      }
    }));
  }

  // Surfaced for the CLI/api (not part of the agent belt).
  list(caseId: CaseId): Promise<ModuleResult<readonly MemoryCard[]>> { return this.store.list(caseId); }
  save(caseId: CaseId, title: string, body: string, tags?: readonly string[]): Promise<ModuleResult<MemoryCard>> {
    return this.store.save(caseId, { title, body, ...(tags ? { tags } : {}) });
  }
  remove(id: string, caseId: CaseId): Promise<ModuleResult<void>> { return this.store.remove(brandId<'MemoryId'>(id) as MemoryId, caseId); }
}

export interface MemoryModuleOptions { readonly root: string }

export function memoryModule(opts: MemoryModuleOptions): DomiaModule {
  return {
    manifest: { id: MEMORY, version: '0.0.0', provides: [EP.MemoryService], requires: [moduleId('trace'), moduleId('store')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const store = host.resolve(EP.Store);
      if (store.isErr()) return resultErr(store.error);
      const svc = new MemoryServiceImpl(new MemoryStore(join(opts.root), store.value), host.tracer);
      const reg = host.register(EP.MemoryService, svc);
      if (reg.isErr()) return reg;
      host.logger.info('memory ready', { root: opts.root });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}

export type { MemoryServiceImpl };
