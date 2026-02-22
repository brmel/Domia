import { injectable } from 'tsyringe';
import type { BuiltInPlatformType } from '@domain/types/PlatformConfig';
import type { WorkflowStepDefinition } from '@domain/entities/Workflow';

export type CapabilityFamily =
    | 'navigate'
    | 'locate'
    | 'interact'
    | 'extract'
    | 'validate'
    | 'app-control'
    | 'system-control';

export type CapabilitySupport = 'supported' | 'degraded' | 'unsupported';
export type CapabilityPlatform = BuiltInPlatformType;

export interface CapabilityDecision {
    readonly capability: CapabilityFamily;
    readonly support: CapabilitySupport;
    readonly reason: string;
}

export interface StepCapabilityAssessment {
    readonly requiredCapabilities: readonly CapabilityFamily[];
    readonly decisions: readonly CapabilityDecision[];
    readonly blocked: boolean;
    readonly reason?: string;
}

@injectable()
export class PlatformCapabilityNegotiationService {
    can(capability: CapabilityFamily, platform: CapabilityPlatform, context?: { readonly stepName?: string }): CapabilityDecision {
        const support = this.resolveSupport(capability, platform);
        const reason = this.describeReason(capability, platform, support, context?.stepName);

        return {
            capability,
            support,
            reason
        };
    }

    assessStep(step: WorkflowStepDefinition, platform: CapabilityPlatform): StepCapabilityAssessment {
        const requiredCapabilities = this.inferRequiredCapabilities(step);
        const decisions = requiredCapabilities.map((capability) => this.can(capability, platform, { stepName: step.name }));
        const unsupported = decisions.find((decision) => decision.support === 'unsupported');

        if (unsupported) {
            return {
                requiredCapabilities,
                decisions,
                blocked: true,
                reason: unsupported.reason
            };
        }

        return {
            requiredCapabilities,
            decisions,
            blocked: false
        };
    }

    private inferRequiredCapabilities(step: WorkflowStepDefinition): readonly CapabilityFamily[] {
        const prompt = step.prompt.toLowerCase();
        const required = new Set<CapabilityFamily>(['interact']);

        if (/navigate|open\s+url|visit\s+|go\s+to/.test(prompt)) {
            required.add('navigate');
        }

        if (/extract|scrape|read\s+text|capture\s+text/.test(prompt)) {
            required.add('extract');
        }

        if (/verify|validate|assert|check/.test(prompt)) {
            required.add('validate');
        }

        if (/window|tray|menu\s+bar|launch\s+app|quit\s+app/.test(prompt)) {
            required.add('app-control');
        }

        if (/terminal|shell|filesystem|file\s+system|os\s+level|system\s+settings/.test(prompt)) {
            required.add('system-control');
        }

        return [...required];
    }

    private resolveSupport(capability: CapabilityFamily, platform: CapabilityPlatform): CapabilitySupport {
        const matrix: Record<CapabilityPlatform, Record<CapabilityFamily, CapabilitySupport>> = {
            web: {
                navigate: 'supported',
                locate: 'supported',
                interact: 'supported',
                extract: 'supported',
                validate: 'supported',
                'app-control': 'unsupported',
                'system-control': 'unsupported'
            },
            electron: {
                navigate: 'degraded',
                locate: 'supported',
                interact: 'supported',
                extract: 'supported',
                validate: 'supported',
                'app-control': 'supported',
                'system-control': 'degraded'
            }
        };

        return matrix[platform][capability];
    }

    private describeReason(
        capability: CapabilityFamily,
        platform: CapabilityPlatform,
        support: CapabilitySupport,
        stepName?: string
    ): string {
        const stepLabel = stepName ? ` for step '${stepName}'` : '';
        return `Capability '${capability}' is ${support} on platform '${platform}'${stepLabel}`;
    }
}
