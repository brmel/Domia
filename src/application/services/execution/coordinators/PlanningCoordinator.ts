import { injectable } from 'tsyringe';
import type { SkillDefinition } from '@domain/skills/SkillContract';

export interface SkillRoutingContext {
    readonly skill: SkillDefinition;
    readonly graphSteps: readonly string[];
    readonly source: 'preferred' | 'auto';
}

@injectable()
export class PlanningCoordinator {
    buildPlanningPrompt(basePrompt: string, skillRouting?: SkillRoutingContext): string {
        if (!skillRouting) {
            return basePrompt;
        }

        const graph = skillRouting.graphSteps.map((step, index) => `${index + 1}. ${step}`).join('\n');

        return [
            basePrompt,
            'Skill routing context:',
            `Selected skill: ${skillRouting.skill.id} v${skillRouting.skill.version} (${skillRouting.skill.trust})`,
            `Routing source: ${skillRouting.source}`,
            'Bounded skill execution graph:',
            graph,
            'Use this graph as preferred execution backbone while preserving safety and verification.'
        ].join('\n\n');
    }
}
