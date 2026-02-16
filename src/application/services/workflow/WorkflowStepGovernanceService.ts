import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import { RuntimeReadinessPolicyService } from '@application/services/hardening/RuntimeReadinessPolicyService';
import { SkillRegistryService } from '@application/services/skills/SkillRegistryService';
import { SkillGovernanceService } from '@application/services/skills/SkillGovernanceService';
import { PluginRegistryService } from '@application/services/plugins/PluginRegistryService';
import { PluginGatewayService } from '@application/services/plugins/PluginGatewayService';

export type StepGovernanceDecision =
    | { allowed: true }
    | {
        allowed: false;
        reason: string;
    };

@injectable()
export class WorkflowStepGovernanceService {
    constructor(
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject(SkillRegistryService) private readonly skillRegistry: SkillRegistryService,
        @inject(SkillGovernanceService) private readonly skillGovernance: SkillGovernanceService,
        @inject(PluginRegistryService) private readonly pluginRegistry: PluginRegistryService,
        @inject(PluginGatewayService) private readonly pluginGateway: PluginGatewayService
    ) {}

    assess(
        step: WorkflowStepDefinition,
        definition: WorkflowDefinition,
        workflowRunId: string
    ): StepGovernanceDecision {
        const readinessDecision = this.assessReadiness(step, definition);
        if (readinessDecision?.blocked) {
            return {
                allowed: false,
                reason: `Workflow step blocked by readiness policy (${readinessDecision.mode}).`
            };
        }

        const preferredSkillId = step.options?.preferredSkillId;
        if (preferredSkillId) {
            const skill = this.skillRegistry.get(preferredSkillId);
            if (!skill) {
                return {
                    allowed: false,
                    reason: `Workflow step blocked: preferred skill not found (${preferredSkillId}).`
                };
            }

            const allowedTrustLevels = step.options?.allowedSkillTrustLevels ?? ['verified'];
            const skillAllowed = this.skillGovernance.isAllowed(skill, allowedTrustLevels);
            if (!skillAllowed) {
                return {
                    allowed: false,
                    reason: `Workflow step blocked: skill trust level ${skill.trust} not allowed.`
                };
            }
        }

        const pluginPreflight = step.options?.pluginPreflight;
        if (pluginPreflight) {
            const manifest = this.pluginRegistry.get(pluginPreflight.pluginId);
            if (!manifest) {
                return {
                    allowed: false,
                    reason: `Workflow step blocked: plugin not found (${pluginPreflight.pluginId}).`
                };
            }

            const authorizationResult = this.pluginGateway.authorize(manifest, {
                runId: workflowRunId,
                pluginId: pluginPreflight.pluginId,
                capability: pluginPreflight.capability,
                payload: {
                    source: 'workflow-step-governance'
                }
            });

            if (!authorizationResult.success) {
                return {
                    allowed: false,
                    reason: `Workflow step blocked: ${authorizationResult.message}`
                };
            }
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