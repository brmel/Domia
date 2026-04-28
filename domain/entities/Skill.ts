import type { SkillId } from '../value-objects/SkillId';
import type { ActionType } from '../enums';

export interface SkillStep {
    readonly actionType: ActionType;
    readonly params: Readonly<Record<string, unknown>>;
    readonly paramTemplates?: Readonly<Record<string, string>>;
}

export interface SkillParameter {
    readonly name: string;
    readonly description?: string;
    readonly required: boolean;
}

export interface Skill {
    readonly id: SkillId;
    readonly name: string;
    readonly description: string;
    readonly parameters: readonly SkillParameter[];
    readonly steps: readonly SkillStep[];
    readonly createdFromRunId?: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export const Skill = {
    create(params: {
        id: SkillId;
        name: string;
        description: string;
        parameters: readonly SkillParameter[];
        steps: readonly SkillStep[];
        createdFromRunId?: string;
    }): Skill {
        return {
            ...params,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    },
} as const;
