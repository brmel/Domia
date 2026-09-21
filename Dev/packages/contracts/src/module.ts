import type { ModuleResult } from './errors.js';
import type { ModuleId } from './ids.js';
import type { EventBus } from './events.js';
import type { Tracer } from './trace.js';

/** D3 — typed extension-point token; `T` is the registered interface. */
export interface ExtensionPoint<T> {
  readonly id: string;
  readonly arity: 'one' | 'many';
  /** Phantom — carries T for inference; never read at runtime. */
  readonly __t?: T;
}
export function extensionPoint<T>(id: string, arity: 'one' | 'many'): ExtensionPoint<T> {
  return { id, arity };
}

export interface ScopedConfig {
  get<T>(key: string, fallback: T): T;
  has(key: string): boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface ModuleManifest {
  readonly id: ModuleId;
  readonly version: string;
  readonly provides: readonly ExtensionPoint<unknown>[];
  readonly requires: readonly ModuleId[];
}

/** The only view of the world a module gets. */
export interface ModuleHost {
  readonly config: ScopedConfig;
  readonly logger: Logger;
  readonly events: EventBus;
  /** NoopTracer until @domia/trace registers the real one (D4). Re-read per access. */
  readonly tracer: Tracer;
  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T>;
  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]>;
  register<T>(point: ExtensionPoint<T>, impl: T): ModuleResult<void>;
}

export interface DomiaModule {
  readonly manifest: ModuleManifest;
  init(host: ModuleHost): Promise<ModuleResult<void>>;
  dispose(): Promise<void>;
}
