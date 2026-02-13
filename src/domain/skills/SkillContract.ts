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

export interface SkillExecutionRequest {
    readonly runId: string;
    readonly skillId: string;
    readonly payload: Record<string, unknown>;
}

export interface SkillExecutionResult {
    readonly success: boolean;
    readonly summary: string;
    readonly data?: Record<string, unknown>;
}
