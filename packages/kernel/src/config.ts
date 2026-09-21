import type { ScopedConfig } from '@domia/contracts';

export interface KernelConfig {
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
  readonly values?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Per-module view: reads `<module>.<key>` then `<key>` from values, then env. */
export class ScopedConfigImpl implements ScopedConfig {
  constructor(private readonly module: string, private readonly cfg: KernelConfig) {}

  private lookup(key: string): unknown {
    const values = this.cfg.values ?? {};
    const scoped = values[`${this.module}.${key}`];
    if (scoped !== undefined) return scoped;
    if (values[key] !== undefined) return values[key];
    const env = this.cfg.env ?? {};
    return env[key];
  }

  get<T>(key: string, fallback: T): T {
    const v = this.lookup(key);
    return (v === undefined ? fallback : (v as T));
  }
  has(key: string): boolean {
    return this.lookup(key) !== undefined;
  }
}
