import { resultErr, resultOk, domiaError, moduleId, EP } from '@domia/contracts';
import type {
  BindingIO, DomiaModule, ModuleHost, ModuleResult, ScopedConfig, SessionOptions, TargetSession, TargetSpec,
  ArtifactMeta, ToolBinding, ToolManifest, ToolProvider, ToolProviderInfo, ToolService, Tracer,
} from '@domia/contracts';
import { PlaywrightMcpProvider } from './providers/mcp/provider.js';
import { ShellProvider } from './providers/shell/provider.js';
import { FilesProvider } from './providers/files/provider.js';
import { FetchScrapeProvider } from './providers/fetch/provider.js';
import { firecrawlProvider, crawl4aiProvider } from './providers/scrape/mcpScrape.js';
import { McpMountProvider, mountToSpec } from './providers/mcp/mountProvider.js';
import { TargetSessionImpl } from './session.js';

const TOOLS = moduleId('tools');

async function disposeAll(bindings: readonly ToolBinding[]): Promise<void> {
  for (const b of bindings) await b.dispose();
}

class ToolServiceImpl implements ToolService {
  constructor(private readonly providers_: readonly ToolProvider[], private readonly tracer: Tracer, private readonly config: ScopedConfig) {}

  providers(): readonly ToolProviderInfo[] {
    return this.providers_.map((p) => ({ id: p.id, scope: p.scope }));
  }
  catalog(target: TargetSpec): readonly ToolManifest[] {
    return this.providers_.filter((p) => p.supports(target)).flatMap((p) => p.manifests(target));
  }

  /** hint (opts.driver) → config `tools.driver.<kind>` → first registered driver. */
  private pickDriver(target: TargetSpec, opts?: SessionOptions): ModuleResult<ToolProvider> {
    const candidates = this.providers_.filter((p) => p.role === 'target' && p.supports(target));
    if (!candidates.length) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `no target driver supports target '${target.kind}'`));
    const hint = opts?.driver ?? this.config.get<string | undefined>(`tools.driver.${target.kind}`, undefined);
    if (!hint) return resultOk(candidates[0]!);
    const chosen = candidates.find((p) => p.id === hint);
    return chosen ? resultOk(chosen) : resultErr(domiaError(TOOLS, 'BAD_CONFIG', `driver '${hint}' unavailable for target '${target.kind}' (have: ${candidates.map((p) => p.id).join(', ')})`));
  }

  private recordDefaults(opts?: SessionOptions): { video: boolean; trace: boolean } {
    return {
      video: opts?.record?.video ?? this.config.get<boolean>('record.video', false),
      trace: opts?.record?.trace ?? this.config.get<boolean>('record.trace', true),
    };
  }

  async allocSession(target: TargetSpec, opts?: SessionOptions): Promise<ModuleResult<TargetSession>> {
    return this.tracer.withSpan('tool.allocSession', { target: target.kind, driver: opts?.driver ?? '' }, async () => this.attachAll(target, opts));
  }

  private async attachAll(target: TargetSpec, options?: SessionOptions): Promise<ModuleResult<TargetSession>> {
    const opts: SessionOptions = { ...options, record: this.recordDefaults(options) };
    const picked = this.pickDriver(target, opts);
    if (picked.isErr()) return resultErr(picked.error);
    const driver = picked.value;
    // Stamp the run id so every captured artifact is tied to its run (provenance).
    const runId = opts?.runId as ArtifactMeta['runId'] | undefined;
    const io: BindingIO = { saveArtifact: (data, m) => this.tracer.saveArtifact(data, runId ? { ...m, runId } : m) };

    const attached = await driver.attach(target, io, opts);
    if (attached.isErr()) return resultErr(attached.error);
    const bindings: ToolBinding[] = [attached.value];

    // Auxiliary providers (shell, files, …) add host-side capability to any target.
    // A workdir-less session simply doesn't get them, rather than failing the run.
    for (const aux of this.providers_.filter((p) => p.role === 'auxiliary' && p.supports(target))) {
      const r = await aux.attach(target, io, opts);
      if (r.isOk()) bindings.push(r.value);
    }

    // Case-mounted MCP servers (E1) — crawl4ai, github, postgres, … add capability
    // to whatever target is running. A failed mount degrades the run, never kills it.
    for (const mount of opts?.mcpServers ?? []) {
      const spec = mountToSpec(mount, (v) => v);
      if (spec.isErr()) { await disposeAll(bindings); return resultErr(spec.error); }
      const mounted = await new McpMountProvider(mount, spec.value).attach(target, io, opts);
      if (mounted.isErr()) { await disposeAll(bindings); return resultErr(mounted.error); }
      bindings.push(mounted.value);
    }

    const caps = [...new Set(bindings.flatMap((b) => b.manifests().flatMap((mm) => mm.capabilities)))];
    return resultOk(new TargetSessionImpl(target, bindings, caps, this.tracer, opts?.headed ?? false));
  }
}

export function toolsModule(): DomiaModule {
  return {
    manifest: { id: TOOLS, version: '0.0.0', provides: [EP.ToolService, EP.ToolProvider], requires: [moduleId('trace')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      // Target drivers first (playwright is the default first-match); auxiliaries last.
      const providers: ToolProvider[] = [
        new PlaywrightMcpProvider(), new FetchScrapeProvider(), firecrawlProvider(), crawl4aiProvider(),
        new ShellProvider(), new FilesProvider(),
      ];
      for (const p of providers) {
        const r = host.register(EP.ToolProvider, p);
        if (r.isErr()) return r;
      }
      const svc = new ToolServiceImpl(providers, host.tracer, host.config);
      const reg = host.register(EP.ToolService, svc);
      if (reg.isErr()) return reg;
      host.logger.info('tools ready', { providers: providers.map((p) => p.id) });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
