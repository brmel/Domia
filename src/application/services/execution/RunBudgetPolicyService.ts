import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { RunInput } from '@application/dtos';
import { DEFAULT_MAX_ACTIONS, DEFAULT_MAX_DURATION_MS, DEFAULT_MAX_ESTIMATED_TOKENS } from '@shared/defaults';

type RunBudgetDimension = 'actions' | 'duration' | 'tokens';

export interface RunBudgetLimits {
    readonly maxActions: number;
    readonly maxDurationMs: number;
    readonly maxEstimatedTokens: number;
}

interface RunBudgetSnapshot {
    readonly actionsTaken: number;
    readonly elapsedMs: number;
    readonly estimatedTokensUsed: number;
}

interface RunBudgetAssessment {
    readonly status: 'ok' | 'exceeded';
    readonly exceeded: readonly RunBudgetDimension[];
}

const DEFAULT_LIMITS: RunBudgetLimits = {
    maxActions: DEFAULT_MAX_ACTIONS,
    maxDurationMs: DEFAULT_MAX_DURATION_MS,
    maxEstimatedTokens: DEFAULT_MAX_ESTIMATED_TOKENS
};

@injectable()
export class RunBudgetPolicyService {
    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    resolveLimits(options: RunInput['options'] | undefined): RunBudgetLimits {
        return {
            maxActions: this.safePositiveInt(options?.maxSteps, DEFAULT_LIMITS.maxActions),
            maxDurationMs: this.safePositiveInt(options?.maxDurationMs, DEFAULT_LIMITS.maxDurationMs),
            maxEstimatedTokens: this.safePositiveInt(options?.maxEstimatedTokens, DEFAULT_LIMITS.maxEstimatedTokens)
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

        return {
            status: exceeded.length > 0 ? 'exceeded' : 'ok',
            exceeded
        };
    }

    evaluate(runId: string, limits: RunBudgetLimits, snapshot: RunBudgetSnapshot): RunBudgetAssessment {
        const assessment = this.assess(limits, snapshot);
        if (assessment.status === 'exceeded') {
            this.logger.warn('[RunBudgetPolicyService] Run budget exceeded', {
                runId,
                exceeded: assessment.exceeded,
                limits,
                snapshot
            });
        }

        return assessment;
    }

    formatExceededMessage(limits: RunBudgetLimits, snapshot: RunBudgetSnapshot, assessment: RunBudgetAssessment): string {
        return `Run budget exceeded (${assessment.exceeded.join(', ')}). actions=${snapshot.actionsTaken}/${limits.maxActions}, durationMs=${snapshot.elapsedMs}/${limits.maxDurationMs}, tokens=${snapshot.estimatedTokensUsed}/${limits.maxEstimatedTokens}`;
    }

    private safePositiveInt(value: number | undefined, defaultValue: number): number {
        if (!Number.isFinite(value) || !value || value <= 0) {
            return defaultValue;
        }

        return Math.floor(value);
    }

}
