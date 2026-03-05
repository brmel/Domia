import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { createMockLogger } from '../../../../helpers/createMockLogger';

function createService(maxReplansPerRun?: number): { service: ReplanningPolicyService; logger: ReturnType<typeof createMockLogger> } {
    const logger = createMockLogger();

    const configService = maxReplansPerRun === undefined
        ? undefined
        : {
            get: () => ({
                limits: {
                    maxReplansPerRun
                }
            })
        };

    return {
        service: new ReplanningPolicyService(logger, configService as never),
        logger
    };
}

describe('ReplanningPolicyService', () => {
    it('resolves active default limits', () => {
        const { service } = createService();

        const limits = service.resolveLimits();

        expect(limits.mode).toBe('active');
        expect(limits.maxReplansPerRun).toBe(2);
    });

    it('uses configured max replans when provided', () => {
        const { service } = createService(4);

        const limits = service.resolveLimits();

        expect(limits.maxReplansPerRun).toBe(4);
    });

    it('approves replanning when trigger is present and budget remains', () => {
        const { service } = createService();

        const assessment = service.assess({
            runId: 'run-1',
            replanCount: 0,
            trigger: 'loop_detected'
        });

        expect(assessment.mode).toBe('active');
        expect(assessment.shouldReplan).toBe(true);
    });

    it('does not suggest when replanning budget is exhausted', () => {
        const { service } = createService();

        const assessment = service.assess({
            runId: 'run-1',
            replanCount: 2,
            trigger: 'action_execution_error'
        });

        expect(assessment.shouldReplan).toBe(false);
        expect(assessment.reason).toContain('budget exhausted');
    });

    it('logs info when replanning is approved', () => {
        const { service, logger } = createService();

        service.logIfSuggested({
            runId: 'run-1',
            replanCount: 0,
            trigger: 'assertion_fail'
        });

        expect(logger.info).toHaveBeenCalledTimes(1);
    });
});
