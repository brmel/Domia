import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';

function createService(): { service: RunBudgetPolicyService; logger: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } } {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    return {
        service: new RunBudgetPolicyService(logger),
        logger
    };
}

describe('RunBudgetPolicyService', () => {
    it('resolves defaults when options are missing', () => {
        const { service } = createService();

        const limits = service.resolveLimits(undefined);

        expect(limits.maxActions).toBe(20);
        expect(limits.maxDurationMs).toBe(15 * 60 * 1000);
        expect(limits.maxEstimatedTokens).toBe(120_000);
        expect(limits.maxRetries).toBe(40);
    });

    it('returns warning when one or more dimensions exceed limits', () => {
        const { service } = createService();

        const assessment = service.assess(
            {
                maxActions: 2,
                maxDurationMs: 100,
                maxEstimatedTokens: 50,
                maxRetries: 1
            },
            {
                actionsTaken: 3,
                elapsedMs: 120,
                estimatedTokensUsed: 80,
                retryCount: 0
            }
        );

        expect(assessment.status).toBe('exceeded');
        expect(assessment.exceeded).toEqual(['actions', 'duration', 'tokens']);
    });

    it('logs warning when exceeded via evaluate', () => {
        const { service, logger } = createService();

        const assessment = service.evaluate(
            'run-1',
            {
                maxActions: 1,
                maxDurationMs: 1,
                maxEstimatedTokens: 1,
                maxRetries: 0
            },
            {
                actionsTaken: 2,
                elapsedMs: 2,
                estimatedTokensUsed: 2,
                retryCount: 1
            }
        );

        expect(assessment.status).toBe('exceeded');
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
