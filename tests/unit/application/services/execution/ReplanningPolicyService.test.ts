import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';

function createService(maxReplansPerRun?: number): { service: ReplanningPolicyService } {
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
        service: new ReplanningPolicyService(configService as never),
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
});
