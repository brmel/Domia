import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import { WorkflowStepGovernanceService } from './WorkflowStepGovernanceService';
import { PlatformCapabilityNegotiationService } from '../platform/PlatformCapabilityNegotiationService';

export type StepEvaluation =
    | { readonly allowed: false; readonly warnings: readonly string[]; readonly blockedReason: string }
    | { readonly allowed: true; readonly warnings: readonly string[]; readonly degradationSummary?: string };

@injectable()
export class WorkflowStepEvaluationService {
    constructor(
        @inject(WorkflowStepGovernanceService) private readonly governance: WorkflowStepGovernanceService,
        @inject(PlatformCapabilityNegotiationService) private readonly capabilities: PlatformCapabilityNegotiationService,
    ) {}

    evaluate(step: WorkflowStepDefinition, definition: WorkflowDefinition): StepEvaluation {
        const warnings = this.governance.assess(step, definition).warnings;

        const capability = this.capabilities.assessStep(step, definition.platformConfig.platform);
        if (capability.blocked) {
            return {
                allowed: false,
                warnings,
                blockedReason: capability.reason ?? `Step '${step.name}' blocked by platform capability policy.`,
            };
        }

        const degraded = capability.decisions.filter((d) => d.support === 'degraded');
        return {
            allowed: true,
            warnings,
            ...(degraded.length > 0
                ? { degradationSummary: `Capability degradation: ${degraded.map((d) => d.capability).join(', ')}` }
                : {}),
        };
    }
}
