import { inject, injectable } from 'tsyringe';
import type { ILogger, IConfigService } from '@domain/ports';

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

const DEFAULT_MAX_REPLANS_PER_RUN = 2;

@injectable()
export class ReplanningPolicyService {
    constructor(
        @inject('ILogger') private readonly logger: ILogger,
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

    logIfSuggested(input: ReplanningAssessmentInput): void {
        const assessment = this.assess(input);
        if (!assessment.shouldReplan) {
            return;
        }

        this.logger.warn('[ReplanningPolicyService] Replanning approved (active mode)', {
            runId: input.runId,
            trigger: input.trigger,
            replanCount: input.replanCount,
            reason: assessment.reason
        });
    }
}
