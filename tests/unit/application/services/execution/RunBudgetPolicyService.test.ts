import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RunBudgetPolicyService } from '@application/services/execution/RunBudgetPolicyService';
import { createMockLogger } from '../../../../helpers/createMockLogger';

function createService(): { service: RunBudgetPolicyService; logger: ReturnType<typeof createMockLogger> } {
    const logger = createMockLogger();

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
    });

    it('returns warning when one or more dimensions exceed limits', () => {
        const { service } = createService();

        const assessment = service.assess(
            {
                maxActions: 2,
                maxDurationMs: 100,
                maxEstimatedTokens: 50
            },
            {
                actionsTaken: 3,
                elapsedMs: 120,
                estimatedTokensUsed: 80
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
                maxEstimatedTokens: 1
            },
            {
                actionsTaken: 2,
                elapsedMs: 2,
                estimatedTokensUsed: 2
            }
        );

        expect(assessment.status).toBe('exceeded');
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
