import { injectable } from 'tsyringe';
import type { WorkflowStepDefinition } from '@domain/entities/Workflow';

export interface StepExecutionPolicy {
    readonly maxAttempts: number;
    readonly timeoutMs: number;
}

export interface StepExecutionResult {
    readonly success: boolean;
    readonly summary?: string;
    readonly testRunId?: string;
}

@injectable()
export class WorkflowStepPolicyService {
    resolve(step: WorkflowStepDefinition): StepExecutionPolicy {
        const maxRetries = step.options?.maxRetries ?? 0;
        const maxDurationMs = step.options?.maxDurationMs ?? 180_000;

        return {
            maxAttempts: Math.max(1, maxRetries + 1),
            timeoutMs: Math.max(1_000, maxDurationMs)
        };
    }

    async runWithPolicy(
        step: WorkflowStepDefinition,
        executeAttempt: (attempt: number) => Promise<StepExecutionResult>
    ): Promise<StepExecutionResult> {
        const policy = this.resolve(step);

        let lastResult: StepExecutionResult = {
            success: false,
            summary: 'Step execution did not produce a result.'
        };

        for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
            const result = await this.withTimeout(executeAttempt(attempt), policy.timeoutMs);
            lastResult = result;

            if (result.success) {
                return result;
            }
        }

        return lastResult;
    }

    private async withTimeout(promise: Promise<StepExecutionResult>, timeoutMs: number): Promise<StepExecutionResult> {
        let timeoutHandle: NodeJS.Timeout | null = null;

        const timeoutPromise = new Promise<StepExecutionResult>((resolve) => {
            timeoutHandle = setTimeout(() => {
                resolve({
                    success: false,
                    summary: `Step timed out after ${timeoutMs}ms.`
                });
            }, timeoutMs);
        });

        const result = await Promise.race([promise, timeoutPromise]);
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
        return result;
    }
}
