import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';

type StepGovernanceDecision =
    | { allowed: true }
    | {
        allowed: false;
        reason: string;
    };

@injectable()
export class WorkflowStepGovernanceService {
    constructor(
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService
    ) {}

    assess(
        step: WorkflowStepDefinition,
        definition: WorkflowDefinition,
    ): StepGovernanceDecision {
        const readinessDecision = this.assessReadiness(step, definition);
        if (readinessDecision?.blocked) {
            return {
                allowed: false,
                reason: `Workflow step blocked by readiness policy (${readinessDecision.mode}).`
            };
        }

        return { allowed: true };
    }

    private assessReadiness(
        step: WorkflowStepDefinition,
        definition: WorkflowDefinition
    ): { blocked: boolean; mode: string } | null {
        if (definition.platformConfig.platform !== 'web') {
            return null;
        }

        const decision = this.readinessPolicy.assess(
            {
                prompt: step.prompt,
                ...(step.options ? { options: step.options } : {})
            },
            definition.platformConfig.url
        );

        return {
            blocked: decision.blocked,
            mode: decision.mode
        };
    }
}