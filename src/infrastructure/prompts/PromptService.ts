import { injectable, inject } from 'tsyringe';
import type { IConfigService } from '@domain/ports/IConfigService';
import type {
    IPromptService,
    PromptKey,
    PromptOverrides,
} from '@domain/ports/IPromptService';
import {
    DEFAULT_SYSTEM_INSTRUCTION,
    DEFAULT_STEP_GOAL,
    DEFAULT_LOOP_WARNING,
    DEFAULT_TARGETING_BOTH,
    DEFAULT_TARGETING_REF_ONLY,
    DEFAULT_TARGETING_MOUSE_ONLY,
    DEFAULT_SHELL_CAPABILITY_NOTE,
    DEFAULT_SHELL_AVAILABLE_RULE,
    DEFAULT_SHELL_UNAVAILABLE_RULE,
    DEFAULT_TOOL_DESCRIPTIONS,
} from './promptDefaults';

const INLINE_DEFAULTS: Record<PromptKey, string> = {
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    stepGoal: DEFAULT_STEP_GOAL,
    loopWarning: DEFAULT_LOOP_WARNING,
    targetingBoth: DEFAULT_TARGETING_BOTH,
    targetingRefOnly: DEFAULT_TARGETING_REF_ONLY,
    targetingMouseOnly: DEFAULT_TARGETING_MOUSE_ONLY,
    shellCapabilityNote: DEFAULT_SHELL_CAPABILITY_NOTE,
    shellAvailableRule: DEFAULT_SHELL_AVAILABLE_RULE,
    shellUnavailableRule: DEFAULT_SHELL_UNAVAILABLE_RULE,
};

function parseToolDescriptions(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const sections = content.split(/^## /m).slice(1);
    for (const section of sections) {
        const newlineIdx = section.indexOf('\n');
        if (newlineIdx === -1) continue;
        const name = section.slice(0, newlineIdx).trim();
        const body = section.slice(newlineIdx + 1).trim();
        if (name && body) {
            result[name] = body;
        }
    }
    return result;
}

@injectable()
export class PromptService implements IPromptService {
    private readonly defaultPrompts: Record<PromptKey, string>;
    private readonly defaultToolDescriptions: Record<string, string>;
    private promptOverrides: Partial<Record<PromptKey, string>>;
    private toolDescriptionOverrides: Partial<Record<string, string>>;

    constructor(
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {
        this.defaultPrompts = { ...INLINE_DEFAULTS };
        this.defaultToolDescriptions = parseToolDescriptions(DEFAULT_TOOL_DESCRIPTIONS);

        const config = this.configService.get();
        this.promptOverrides = { ...config.promptOverrides?.prompts };
        this.toolDescriptionOverrides = { ...config.promptOverrides?.toolDescriptions };
    }

    getPrompt(key: PromptKey): string {
        return this.promptOverrides[key] ?? this.defaultPrompts[key];
    }

    getToolDescription(toolName: string): string | undefined {
        return this.toolDescriptionOverrides[toolName] ?? this.defaultToolDescriptions[toolName];
    }

    getAllPrompts(): Record<PromptKey, string> {
        const result = { ...this.defaultPrompts };
        for (const [key, value] of Object.entries(this.promptOverrides)) {
            if (value !== undefined) {
                result[key as PromptKey] = value;
            }
        }
        return result;
    }

    getAllToolDescriptions(): Record<string, string> {
        const result = { ...this.defaultToolDescriptions };
        for (const [key, value] of Object.entries(this.toolDescriptionOverrides)) {
            if (value !== undefined) {
                result[key] = value;
            }
        }
        return result;
    }

    setPromptOverride(key: PromptKey, value: string): void {
        this.promptOverrides[key] = value;
        this.persist();
    }

    setToolDescriptionOverride(toolName: string, value: string): void {
        this.toolDescriptionOverrides[toolName] = value;
        this.persist();
    }

    resetPrompt(key: PromptKey): void {
        delete this.promptOverrides[key];
        this.persist();
    }

    resetToolDescription(toolName: string): void {
        delete this.toolDescriptionOverrides[toolName];
        this.persist();
    }

    resetAll(): void {
        this.promptOverrides = {};
        this.toolDescriptionOverrides = {};
        this.persist();
    }

    getOverrides(): PromptOverrides {
        return {
            prompts: Object.keys(this.promptOverrides).length > 0 ? { ...this.promptOverrides } : undefined,
            toolDescriptions: Object.keys(this.toolDescriptionOverrides).length > 0 ? { ...this.toolDescriptionOverrides } : undefined,
        };
    }

    private persist(): void {
        const overrides = this.getOverrides();
        this.configService.update({ promptOverrides: overrides } as Partial<ReturnType<IConfigService['get']>>);
    }
}
