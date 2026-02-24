import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { SkillDefinition } from '@domain/skills/SkillContract';
import type { SkillRegistryService } from '../../skills/SkillRegistryService';
import type { SkillGovernanceService } from '../../skills/SkillGovernanceService';
import type { SkillRoutingContext } from './PlanningCoordinator';
import type { RunTestInput } from '@application/dtos';

@injectable()
export class SkillRoutingCoordinator {
    constructor(
        @inject('SkillRegistryService') private readonly skillRegistry: SkillRegistryService,
        @inject('SkillGovernanceService') private readonly skillGovernance: SkillGovernanceService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    resolve(input: RunTestInput, runId: string): SkillRoutingContext | undefined {
        const skillId = input.options?.preferredSkillId?.trim();

        try {
            const allowedTrustLevels = input.options?.allowedSkillTrustLevels ?? ['verified'];

            if (skillId) {
                const preferredSkill = this.skillRegistry.get(skillId);
                if (!preferredSkill) {
                    this.logger.warn('[SkillRoutingCoordinator] Skill routing skipped: preferred skill not found', { runId, skillId });
                    return undefined;
                }

                const allowed = this.skillGovernance.isAllowed(preferredSkill, allowedTrustLevels);
                this.logger.info('[SkillRoutingCoordinator] Skill routing evaluated preferred skill', {
                    runId,
                    skillId,
                    skillTrust: preferredSkill.trust,
                    allowed
                });

                if (!allowed) {
                    return undefined;
                }

                return {
                    skill: preferredSkill,
                    source: 'preferred',
                    graphSteps: this.buildSkillExecutionGraph(preferredSkill)
                };
            }

            const autoSkill = this.selectAutoSkill(input.prompt, allowedTrustLevels);
            if (!autoSkill) {
                return undefined;
            }

            this.logger.info('[SkillRoutingCoordinator] Skill routing auto-selected skill', {
                runId,
                skillId: autoSkill.id,
                skillTrust: autoSkill.trust
            });

            return {
                skill: autoSkill,
                source: 'auto',
                graphSteps: this.buildSkillExecutionGraph(autoSkill)
            };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn('[SkillRoutingCoordinator] Skill routing failed non-fatally', { runId, ...(skillId ? { skillId } : {}), reason });
            return undefined;
        }
    }

    private selectAutoSkill(prompt: string, allowedTrustLevels: readonly SkillDefinition['trust'][]): SkillDefinition | undefined {
        const scoredSkills = this.skillRegistry
            .list()
            .filter(skill => this.skillGovernance.isAllowed(skill, allowedTrustLevels))
            .map(skill => ({
                skill,
                score: this.scoreSkillMatch(prompt, skill)
            }))
            .filter(entry => entry.score > 0)
            .sort((left, right) => right.score - left.score);

        return scoredSkills[0]?.skill;
    }

    private scoreSkillMatch(prompt: string, skill: SkillDefinition): number {
        const normalizedPrompt = prompt.toLowerCase();
        const tokens = [
            ...skill.id.toLowerCase().split(/[^a-z0-9]+/g),
            ...skill.description.toLowerCase().split(/[^a-z0-9]+/g),
            ...skill.preconditions.flatMap((item) => item.toLowerCase().split(/[^a-z0-9]+/g)),
            ...skill.postconditions.flatMap((item) => item.toLowerCase().split(/[^a-z0-9]+/g))
        ].filter(token => token.length >= 3);

        if (tokens.length === 0) {
            return 0;
        }

        let score = 0;
        for (const token of new Set(tokens)) {
            if (normalizedPrompt.includes(token)) {
                score += 1;
            }
        }

        return score;
    }

    private buildSkillExecutionGraph(skill: SkillDefinition): readonly string[] {
        const steps: string[] = [];

        skill.preconditions.forEach((precondition) => {
            steps.push(`Validate precondition: ${precondition}`);
        });

        steps.push(`Execute skill objective: ${skill.description}`);

        skill.postconditions.forEach((postcondition) => {
            steps.push(`Verify postcondition: ${postcondition}`);
        });

        return steps.slice(0, 6);
    }
}
