import type { DomiaConfig } from '@shared/contracts/config';

export interface IConfigService {
    get(): DomiaConfig;
    /** Persist changes to disk (use for user-initiated settings changes). */
    update(updates: Partial<DomiaConfig>): void;
    /** Apply in-memory-only overrides for the current process (not persisted, use for CLI per-run flags). */
    updateTransient(updates: Partial<DomiaConfig>): void;
}
