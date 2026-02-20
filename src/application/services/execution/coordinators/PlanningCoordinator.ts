import { injectable } from 'tsyringe';
import type { SkillDefinition } from '@domain/skills/SkillContract';
import type { Plan } from '@domain/entities/Plan';
import { nanoid } from 'nanoid';

export interface SkillRoutingContext {
    readonly skill: SkillDefinition;
    readonly graphSteps: readonly string[];
    readonly source: 'preferred' | 'auto';
}

@injectable()
export class PlanningCoordinator {
    buildSingleStepPlan(prompt: string): Plan {
        const now = new Date();

        return {
            id: nanoid(),
            goal: prompt,
            status: 'planning',
            createdAt: now,
            updatedAt: now,
            items: [
                {
                    id: nanoid(),
                    description: prompt,
                    status: 'pending',
                    type: 'browser'
                }
            ]
        };
    }

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
