import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import { WorkflowStepKind } from '@domain/value-objects/WorkflowStepKind';
import { Platform } from '@domain/value-objects';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';

interface StepGovernanceDecision {
    readonly allowed: true;
    readonly warnings: readonly string[];
}

@injectable()
export class WorkflowStepGovernanceService {
    constructor(
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService
    ) {}

    assess(
        step: WorkflowStepDefinition,
        definition: WorkflowDefinition,
    ): StepGovernanceDecision {
        const warnings: string[] = [];
        if (definition.platformConfig.platform === Platform.Web) {
            const promptText = step.kind === WorkflowStepKind.Agent ? step.prompt : step.bodyPrompt;
            const decision = this.readinessPolicy.assess(
                { prompt: promptText, ...(step.options ? { options: step.options } : {}) },
                definition.platformConfig.url,
            );
            if (decision.message) warnings.push(decision.message);
        }
        return { allowed: true, warnings };
    }
}