import { resultErr, resultOk, domiaError, moduleId, EP } from '@domia/contracts';
import type { DomiaModule, EventBus, ExtensionPoint, Logger, ModuleHost, ModuleResult, ScopedConfig, Tracer } from '@domia/contracts';
import { ExtensionRegistry } from './registry.js';
import { topoSort } from './topo.js';
import { TypedEventBus } from './eventBus.js';
import { ScopedConfigImpl, type KernelConfig } from './config.js';
import { rootLogger } from './logger.js';
import { NoopTracer } from './noopTracer.js';

const KERNEL = moduleId('kernel');

export interface Kernel {
  load(modules: readonly DomiaModule[]): Promise<ModuleResult<void>>;
  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T>;
  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]>;
  readonly events: EventBus;
  shutdown(): Promise<void>;
}

class KernelImpl implements Kernel {
  readonly events: EventBus = new TypedEventBus();
  private readonly registry = new ExtensionRegistry();
  private readonly log: Logger;
  private readonly noop = new NoopTracer();
  private loaded: DomiaModule[] = [];

  constructor(private readonly cfg: KernelConfig) {
    this.log = rootLogger(cfg.logLevel ?? 'info');
  }

  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T> { return this.registry.resolve(point); }
  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]> { return this.registry.resolveAll(point); }

  private tracer(): Tracer {
    const t = this.registry.resolve(EP.Tracer);
    return t.isOk() ? t.value : this.noop;
  }

  private hostFor(module: DomiaModule): ModuleHost {
    const modName = module.manifest.id as string;
    const config: ScopedConfig = new ScopedConfigImpl(modName, this.cfg);
    const logger = this.log.child({ module: modName });
    const self = this;
    return {
      config,
      logger,
      events: this.events,
      get tracer(): Tracer { return self.tracer(); },
      resolve: (p) => this.registry.resolve(p),
      resolveAll: (p) => this.registry.resolveAll(p),
      register: (p, impl) => this.registry.register(p, impl),
    };
  }

  async load(modules: readonly DomiaModule[]): Promise<ModuleResult<void>> {
    const ordered = topoSort(modules);
    if (ordered.isErr()) return resultErr(ordered.error);
    for (const mod of ordered.value) {
      const host = this.hostFor(mod);
      let res: ModuleResult<void>;
      try {
        res = await mod.init(host);
      } catch (e) {
        await this.rollback();
        return resultErr(domiaError(KERNEL, 'BAD_CONFIG', `module '${mod.manifest.id}' threw during init`, { cause: e }));
      }
      if (res.isErr()) { await this.rollback(); return resultErr(res.error); }
      this.loaded.push(mod);
      this.events.emit('module.loaded', { module: mod.manifest.id, version: mod.manifest.version });
    }
    return resultOk(undefined);
  }

  /** D22 — a partial load must not leak: dispose everything already initialized. */
  private async rollback(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    for (const mod of [...this.loaded].reverse()) {
      try { await mod.dispose(); }
      catch (e) { this.log.error(`module '${mod.manifest.id}' threw during dispose`, { err: String(e) }); }
    }
    this.loaded = [];
  }
}

export function createKernel(cfg: KernelConfig = {}): Kernel {
  return new KernelImpl(cfg);
}
