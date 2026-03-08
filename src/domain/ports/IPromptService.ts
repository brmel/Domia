import type { BuiltInToolName } from '@domain/types/ToolTypes';

export type PromptKey =
    | 'systemInstruction'
    | 'stepGoal'
    | 'loopWarning'
    | 'targetingBoth'
    | 'targetingRefOnly'
    | 'targetingMouseOnly'
    | 'shellCapabilityNote'
    | 'shellAvailableRule'
    | 'shellUnavailableRule';

type ToolDescriptionKey = BuiltInToolName;

interface PromptOverrides {
    readonly prompts?: Partial<Record<PromptKey, string>> | undefined;
    readonly toolDescriptions?: Partial<Record<ToolDescriptionKey, string>> | undefined;
}

export interface IPromptService {
    getPrompt(key: PromptKey): string;
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
