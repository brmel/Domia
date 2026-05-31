import type { BuiltInToolName } from '@domain/types/ToolTypes';

export const PromptKey = {
    SystemInstruction: 'systemInstruction',
    StepGoal: 'stepGoal',
    TargetingBoth: 'targetingBoth',
    TargetingRefOnly: 'targetingRefOnly',
    TargetingMouseOnly: 'targetingMouseOnly',
    ShellCapabilityNote: 'shellCapabilityNote',
    ShellAvailableRule: 'shellAvailableRule',
    ShellUnavailableRule: 'shellUnavailableRule',
    ConversationCompaction: 'conversationCompaction',
} as const;
export type PromptKey = typeof PromptKey[keyof typeof PromptKey];

export interface PromptVariables {
    systemInstruction: { toolNames: string; targetingSection: string; shellSection: string; shellExecRule: string };
    stepGoal: { stepGoal: string; viewportWidth: number; viewportHeight: number; url: string; maxActions: number };
    targetingBoth: Record<string, never>;
    targetingRefOnly: Record<string, never>;
    targetingMouseOnly: Record<string, never>;
    shellCapabilityNote: Record<string, never>;
    shellAvailableRule: Record<string, never>;
    shellUnavailableRule: Record<string, never>;
    conversationCompaction: { turns: string; maxChars: number };
}

type ToolDescriptionKey = BuiltInToolName;

export interface PromptOverrides {
    readonly prompts?: Partial<Record<PromptKey, string>> | undefined;
    readonly toolDescriptions?: Partial<Record<ToolDescriptionKey, string>> | undefined;
}

export interface IPromptService {
    getPrompt(key: PromptKey): string;
    renderPrompt<K extends PromptKey>(key: K, vars: PromptVariables[K]): string;
    getToolDescription(toolName: string): string | undefined;
    getAllPrompts(): Record<PromptKey, string>;
    getAllToolDescriptions(): Record<string, string>;
    setPromptOverride(key: PromptKey, value: string): void;
    setToolDescriptionOverride(toolName: string, value: string): void;
    resetPrompt(key: PromptKey): void;
    resetToolDescription(toolName: string): void;
    resetAll(): void;
    getOverrides(): PromptOverrides;
}
