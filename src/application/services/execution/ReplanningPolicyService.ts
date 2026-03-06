import { injectable, inject } from 'tsyringe';
import type { IConfigService } from '@domain/ports';
import { DEFAULT_MAX_REPLANS_PER_RUN } from '@shared/defaults';

export type ReplanningTrigger = 'loop_detected' | 'action_execution_error' | 'assertion_fail' | 'max_actions_reached';

export interface ReplanningPolicyLimits {
    readonly mode: 'active';
    readonly maxReplansPerRun: number;
}

export interface ReplanningAssessmentInput {
    readonly runId: string;
    readonly replanCount: number;
    readonly trigger?: ReplanningTrigger;
}

export interface ReplanningAssessment {
    readonly mode: 'active';
    readonly shouldReplan: boolean;
    readonly reason: string;
}

@injectable()
export class ReplanningPolicyService {
    constructor(
        @inject('IConfigService') private readonly configService?: IConfigService
    ) {}

    resolveLimits(): ReplanningPolicyLimits {
        const configuredLimit = this.configService?.get().limits.maxReplansPerRun;
        return {
            mode: 'active',
            maxReplansPerRun: configuredLimit ?? DEFAULT_MAX_REPLANS_PER_RUN
        };
    }

    assess(input: ReplanningAssessmentInput): ReplanningAssessment {
        const limits = this.resolveLimits();

        if (!input.trigger) {
            return {
                mode: limits.mode,
                shouldReplan: false,
                reason: 'No replanning trigger observed'
            };
        }

        if (input.replanCount >= limits.maxReplansPerRun) {
            return {
                mode: limits.mode,
                shouldReplan: false,
                reason: `Replanning budget exhausted (${limits.maxReplansPerRun})`
            };
        }

        return {
            mode: limits.mode,
            shouldReplan: true,
            reason: `Active replanning approved for trigger '${input.trigger}'`
        };
    }
}
