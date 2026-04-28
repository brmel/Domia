import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import type { ILogger } from '@domain/ports';
import type { RunInput } from '@backend/dto';
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

const safePositiveInt = (fallback: number) =>
    z.number().finite().positive().transform(Math.floor).catch(fallback);

const LimitsSchema = z.object({
    maxSteps: safePositiveInt(DEFAULT_MAX_ACTIONS),
    maxDurationMs: safePositiveInt(DEFAULT_MAX_DURATION_MS),
    maxEstimatedTokens: safePositiveInt(DEFAULT_MAX_ESTIMATED_TOKENS),
}).transform(({ maxSteps, ...rest }) => ({ maxActions: maxSteps, ...rest }));

const CHECKS: ReadonlyArray<[RunBudgetDimension, keyof RunBudgetSnapshot, keyof RunBudgetLimits]> = [
    ['actions', 'actionsTaken', 'maxActions'],
    ['duration', 'elapsedMs', 'maxDurationMs'],
    ['tokens', 'estimatedTokensUsed', 'maxEstimatedTokens'],
];

@injectable()
export class RunBudgetPolicyService {
    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    resolveLimits(options: RunInput['options'] | undefined): RunBudgetLimits {
        return LimitsSchema.parse({
            maxSteps: options?.maxSteps,
            maxDurationMs: options?.maxDurationMs,
            maxEstimatedTokens: options?.maxEstimatedTokens,
        });
    }

    assess(limits: RunBudgetLimits, snapshot: RunBudgetSnapshot): RunBudgetAssessment {
        const exceeded = CHECKS
            .filter(([, s, l]) => snapshot[s] > limits[l])
            .map(([d]) => d);
        return { status: exceeded.length ? 'exceeded' : 'ok', exceeded };
    }

    evaluate(runId: string, limits: RunBudgetLimits, snapshot: RunBudgetSnapshot): RunBudgetAssessment {
        const assessment = this.assess(limits, snapshot);
        if (assessment.status === 'exceeded') {
            this.logger.warn('[RunBudgetPolicyService] Run budget exceeded', {
                runId, exceeded: assessment.exceeded, limits, snapshot
            });
        }
        return assessment;
    }
}
