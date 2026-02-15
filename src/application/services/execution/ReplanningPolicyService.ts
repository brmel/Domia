import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';

export type ReplanningTrigger = 'loop_detected' | 'action_execution_error' | 'assertion_fail' | 'max_actions_reached';

export interface ReplanningPolicyLimits {
    readonly mode: 'observe';
    readonly maxReplansPerRun: number;
}

export interface ReplanningAssessmentInput {
    readonly runId: string;
    readonly replanCount: number;
    readonly trigger?: ReplanningTrigger;
}

export interface ReplanningAssessment {
    readonly mode: 'observe';
    readonly shouldReplan: boolean;
    readonly suggested: boolean;
    readonly reason: string;
}

const DEFAULT_LIMITS: ReplanningPolicyLimits = {
    mode: 'observe',
    maxReplansPerRun: 2
};

@injectable()
export class ReplanningPolicyService {
    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    resolveLimits(): ReplanningPolicyLimits {
        return DEFAULT_LIMITS;
    }

    assess(input: ReplanningAssessmentInput): ReplanningAssessment {
        const limits = this.resolveLimits();

        if (!input.trigger) {
            return {
                mode: limits.mode,
                shouldReplan: false,
                suggested: false,
                reason: 'No replanning trigger observed'
            };
        }

        if (input.replanCount >= limits.maxReplansPerRun) {
            return {
                mode: limits.mode,
                shouldReplan: false,
                suggested: false,
                reason: `Replanning budget exhausted (${limits.maxReplansPerRun})`
            };
        }

        return {
            mode: limits.mode,
            shouldReplan: false,
            suggested: true,
            reason: `Observe-only replanning suggestion for trigger '${input.trigger}'`
        };
    }

    logIfSuggested(input: ReplanningAssessmentInput): void {
        const assessment = this.assess(input);
        if (!assessment.suggested) {
            return;
        }

        this.logger.warn('[ReplanningPolicyService] Replanning suggested (observe-only scaffold)', {
            runId: input.runId,
            trigger: input.trigger,
            replanCount: input.replanCount,
            reason: assessment.reason
        });
    }
}
