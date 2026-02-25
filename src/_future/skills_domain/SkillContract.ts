export type SkillTrustLevel = 'draft' | 'verified' | 'restricted';

export interface SkillSchema {
    readonly input: Record<string, unknown>;
    readonly output: Record<string, unknown>;
}

export interface SkillDefinition {
    readonly id: string;
    readonly version: string;
    readonly description: string;
    readonly trust: SkillTrustLevel;
    readonly schema: SkillSchema;
    readonly preconditions: readonly string[];
    readonly postconditions: readonly string[];
}


