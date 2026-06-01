/**
 * Per-role agent generation config, built once and threaded unchanged (W15).
 * Temperatures descend by role — the planner explores, the actor/evaluator are
 * deterministic. `thinkingBudget` is in tokens (0 = thinking disabled); it is kept
 * here, with the prompt, deliberately: tuning temperature/thinking without revisiting
 * the prompt usually regresses behavior. The actor config drives the current run loop;
 * planner/evaluator are consumed by the planning (W9) and evaluation (W10) services.
 */
export interface RoleGenerationConfig {
    readonly temperature: number;
    readonly thinkingBudget: number;
    readonly includeThoughts: boolean;
}

export const AGENT_ROLE_DEFAULTS = {
    planner: { temperature: 0.2, thinkingBudget: 0, includeThoughts: false },
    actor: { temperature: 0, thinkingBudget: 0, includeThoughts: false },
    evaluator: { temperature: 0, thinkingBudget: 0, includeThoughts: false },
} as const satisfies Record<string, RoleGenerationConfig>;

export type AgentRole = keyof typeof AGENT_ROLE_DEFAULTS;

/** Disabled by default; opt in per-run via `--thinking <budget>` (DOMIA_THINKING_BUDGET). */
export const DEFAULT_THINKING_BUDGET = 0;
