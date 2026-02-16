import { injectable } from 'tsyringe';
import type { Plan, PlanItem } from '@domain/entities/Plan';
import type { SkillDefinition } from '@domain/skills/SkillContract';

@injectable()
export class SkillExecutorService {
    buildRuntimePlan(skill: SkillDefinition, goal: string): Plan {
        const timestamp = new Date();
        const items: PlanItem[] = [
            ...skill.preconditions.map((precondition, index) => this.createPlanItem(skill, `precondition-${index + 1}`, `Validate precondition: ${precondition}`, 'precondition')),
            this.createPlanItem(skill, 'objective', `Execute skill objective: ${skill.description}`, 'objective'),
            ...skill.postconditions.map((postcondition, index) => this.createPlanItem(skill, `postcondition-${index + 1}`, `Verify postcondition: ${postcondition}`, 'postcondition'))
        ];

        return {
            id: `skill-runtime:${skill.id}:${timestamp.getTime()}`,
            goal,
            status: 'executing',
            createdAt: timestamp,
            updatedAt: timestamp,
            items
        };
    }

    prependRuntimePlan(basePlan: Plan, runtimePlan: Plan): Plan {
        return {
            ...basePlan,
            items: [...runtimePlan.items, ...basePlan.items],
            updatedAt: new Date()
        };
    }

    private createPlanItem(
        skill: SkillDefinition,
        suffix: string,
        description: string,
        stage: 'precondition' | 'objective' | 'postcondition'
    ): PlanItem {
        return {
            id: `${skill.id}:${suffix}`,
            description,
            status: 'pending',
            type: 'general',
            metadata: {
                source: 'skill-runtime',
                skillId: skill.id,
                skillVersion: skill.version,
                stage
            }
        };
    }
}
