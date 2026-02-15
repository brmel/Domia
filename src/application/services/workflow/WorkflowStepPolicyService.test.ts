import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { WorkflowStepPolicyService } from './WorkflowStepPolicyService';

describe('WorkflowStepPolicyService', () => {
    it('retries failed attempts until success', async () => {
        const service = new WorkflowStepPolicyService();
        let attempts = 0;

        const result = await service.runWithPolicy(
            {
                id: 'step-1',
                name: 'Retry step',
                prompt: 'retry',
                continueOnFailure: false,
                options: { maxRetries: 2 }
            },
            async () => {
                attempts += 1;
                if (attempts < 3) {
                    return { success: false, summary: 'retry' };
                }
                return { success: true, summary: 'ok' };
            }
        );

        expect(attempts).toBe(3);
        expect(result.success).toBe(true);
    });

    it('times out long-running attempts', async () => {
        const service = new WorkflowStepPolicyService();

        const result = await service.runWithPolicy(
            {
                id: 'step-2',
                name: 'Timeout step',
                prompt: 'timeout',
                continueOnFailure: false,
                options: { maxDurationMs: 1000 }
            },
            async () => {
                await new Promise((resolve) => setTimeout(resolve, 1200));
                return { success: true };
            }
        );

        expect(result.success).toBe(false);
        expect(result.summary).toContain('timed out');
    });
});
