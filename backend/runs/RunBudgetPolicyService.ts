import { injectable } from 'tsyringe';
import { z } from 'zod';
import type { RunInput } from '@backend/dto';
import { DEFAULT_MAX_ACTIONS, DEFAULT_MAX_DURATION_MS, DEFAULT_MAX_ESTIMATED_TOKENS } from '@shared/defaults';

export interface RunBudgetLimits {
    readonly maxActions: number;
    readonly maxDurationMs: number;
    readonly maxEstimatedTokens: number;
}

const safePositiveInt = (fallback: number) =>
    z.number().finite().positive().transform(Math.floor).catch(fallback);

const LimitsSchema = z.object({
    maxSteps: safePositiveInt(DEFAULT_MAX_ACTIONS),
    maxDurationMs: safePositiveInt(DEFAULT_MAX_DURATION_MS),
    maxEstimatedTokens: safePositiveInt(DEFAULT_MAX_ESTIMATED_TOKENS),
}).transform(({ maxSteps, ...rest }) => ({ maxActions: maxSteps, ...rest }));

/**
 * Resolves soft budget ceilings from run options. The budget *veto* was removed
 * in slice 13 (ceilings are now catastrophic-only and enforced via maxActions on
 * the runtime); this service only resolves limits — it no longer assesses/blocks.
 */
@injectable()
export class RunBudgetPolicyService {
    resolveLimits(options: RunInput['options'] | undefined): RunBudgetLimits {
        return LimitsSchema.parse({
            maxSteps: options?.maxSteps,
            maxDurationMs: options?.maxDurationMs,
            maxEstimatedTokens: options?.maxEstimatedTokens,
        });
    }
}
