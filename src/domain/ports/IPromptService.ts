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

export type ToolDescriptionKey =
    | 'observe' | 'extract' | 'wait' | 'waitForCondition'
    | 'click' | 'type' | 'hover' | 'selectOption' | 'dragTo' | 'pressKey'
    | 'mouse_move' | 'mouse_click_left' | 'mouse_click_right'
    | 'mouse_double_click' | 'mouse_drag' | 'mouse_scroll'
    | 'scroll' | 'navigate'
    | 'startRecording' | 'stopAndReviewRecording'
    | 'shell_exec'
    | 'list_windows' | 'switch_window'
    | 'pass' | 'fail';

export interface PromptOverrides {
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
