import { vi } from 'vitest';
import type { ILogger } from '@domain/ports/ILogger';

/**
 * Returns a properly-typed ILogger mock with all methods as vi.fn() spies.
 * Use this instead of inline `{ debug: vi.fn(), ... } as never` casts.
 */
export function createMockLogger(): ILogger & {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    setLevel: ReturnType<typeof vi.fn>;
} {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        setLevel: vi.fn(),
    };
}
