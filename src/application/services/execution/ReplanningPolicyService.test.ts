import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ReplanningPolicyService } from './ReplanningPolicyService';

function createService() {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    return {
        service: new ReplanningPolicyService(logger),
        logger
    };
}

describe('ReplanningPolicyService', () => {
    it('resolves observe-only default limits', () => {
        const { service } = createService();

        const limits = service.resolveLimits();

        expect(limits.mode).toBe('observe');
        expect(limits.maxReplansPerRun).toBe(2);
    });

    it('suggests replanning for trigger while remaining non-blocking', () => {
        const { service } = createService();

        const assessment = service.assess({
            runId: 'run-1',
            replanCount: 0,
            trigger: 'loop_detected'
        });

        expect(assessment.mode).toBe('observe');
        expect(assessment.shouldReplan).toBe(false);
        expect(assessment.suggested).toBe(true);
    });

    it('does not suggest when replanning budget is exhausted', () => {
        const { service } = createService();

        const assessment = service.assess({
            runId: 'run-1',
            replanCount: 2,
            trigger: 'action_execution_error'
        });

        expect(assessment.suggested).toBe(false);
        expect(assessment.reason).toContain('budget exhausted');
    });

    it('logs warning when replanning is suggested', () => {
        const { service, logger } = createService();

        service.logIfSuggested({
            runId: 'run-1',
            replanCount: 0,
            trigger: 'assertion_fail'
        });

        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
