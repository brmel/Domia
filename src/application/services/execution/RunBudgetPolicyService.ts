import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { RunTestInput } from '@application/dtos';

export type RunBudgetDimension = 'actions' | 'duration' | 'tokens' | 'retries';

export interface RunBudgetLimits {
    readonly maxActions: number;
    readonly maxDurationMs: number;
    readonly maxEstimatedTokens: number;
    readonly maxRetries: number;
}

export interface RunBudgetSnapshot {
    readonly actionsTaken: number;
    readonly elapsedMs: number;
    readonly estimatedTokensUsed: number;
    readonly retryCount: number;
}

export interface RunBudgetAssessment {
    readonly status: 'ok' | 'warning';
    readonly exceeded: readonly RunBudgetDimension[];
}

const DEFAULT_LIMITS: RunBudgetLimits = {
    maxActions: 20,
    maxDurationMs: 15 * 60 * 1000,
    maxEstimatedTokens: 120_000,
    maxRetries: 40
};

@injectable()
export class RunBudgetPolicyService {
    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    resolveLimits(options: RunTestInput['options'] | undefined): RunBudgetLimits {
        return {
            maxActions: this.safePositiveInt(options?.maxSteps, DEFAULT_LIMITS.maxActions),
            maxDurationMs: this.safePositiveInt(options?.maxDurationMs, DEFAULT_LIMITS.maxDurationMs),
            maxEstimatedTokens: this.safePositiveInt(options?.maxEstimatedTokens, DEFAULT_LIMITS.maxEstimatedTokens),
            maxRetries: this.safeNonNegativeInt(options?.maxRetries, DEFAULT_LIMITS.maxRetries)
        };
    }

    assess(limits: RunBudgetLimits, snapshot: RunBudgetSnapshot): RunBudgetAssessment {
        const exceeded: RunBudgetDimension[] = [];

        if (snapshot.actionsTaken > limits.maxActions) {
            exceeded.push('actions');
        }

        if (snapshot.elapsedMs > limits.maxDurationMs) {
            exceeded.push('duration');
        }

        if (snapshot.estimatedTokensUsed > limits.maxEstimatedTokens) {
            exceeded.push('tokens');
        }

        if (snapshot.retryCount > limits.maxRetries) {
            exceeded.push('retries');
        }

        return {
            status: exceeded.length > 0 ? 'warning' : 'ok',
            exceeded
        };
    }

    logIfExceeded(runId: string, limits: RunBudgetLimits, snapshot: RunBudgetSnapshot): void {
        const assessment = this.assess(limits, snapshot);
        if (assessment.status === 'ok') {
            return;
        }

        this.logger.warn('[RunBudgetPolicyService] Budget exceeded (non-blocking scaffold)', {
            runId,
            exceeded: assessment.exceeded,
            limits,
            snapshot
        });
    }

    private safePositiveInt(value: number | undefined, fallback: number): number {
        if (!Number.isFinite(value) || !value || value <= 0) {
            return fallback;
        }

        return Math.floor(value);
    }

    private safeNonNegativeInt(value: number | undefined, fallback: number): number {
        if (!Number.isFinite(value) || value === undefined || value < 0) {
            return fallback;
        }

        return Math.floor(value);
    }
}
