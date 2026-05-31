import type {
    DomiaConfig,
    AiConfig,
    PathsConfig,
    PromptOverrides,
} from '@shared/contracts/config';

export interface IConfigService {
    /** Full config — reserved for the settings facade and the IPC `settings.get`. Consumers should prefer slice accessors. */
    get(): DomiaConfig;

    getAi(): AiConfig;
    getPaths(): PathsConfig;
    getPromptOverrides(): PromptOverrides;

    /** Persist changes to disk (use for user-initiated settings changes). */
    update(updates: Partial<DomiaConfig>): void;
    /** Apply in-memory-only overrides for the current process (not persisted, use for CLI per-run flags). */
    updateTransient(updates: Partial<DomiaConfig>): void;
}
