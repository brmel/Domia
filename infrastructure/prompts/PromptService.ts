import { injectable, inject } from 'tsyringe';
import type { IConfigService } from '@domain/ports/IConfigService';
import type {
    IPromptService,
    PromptKey,
    PromptOverrides,
    PromptVariables,
} from '@domain/ports/IPromptService';
import { loadDefaultPrompts } from './promptDefaults';
import { interpolate } from '@shared/reliability/interpolate';

@injectable()
export class PromptService implements IPromptService {
    private readonly defaultPrompts: Record<PromptKey, string>;
    private promptOverrides: Partial<Record<PromptKey, string>>;
    private toolDescriptionOverrides: Partial<Record<string, string>>;

    constructor(
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {
        this.defaultPrompts = loadDefaultPrompts();
        const overrides = this.configService.getPromptOverrides();
        this.promptOverrides = { ...overrides?.prompts };
        this.toolDescriptionOverrides = { ...overrides?.toolDescriptions };
    }

    getPrompt(key: PromptKey): string {
        return this.promptOverrides[key] ?? this.defaultPrompts[key];
    }

    renderPrompt<K extends PromptKey>(key: K, vars: PromptVariables[K]): string {
        return interpolate(this.getPrompt(key), vars as Record<string, string | number>);
    }

    getToolDescription(toolName: string): string | undefined {
        return this.toolDescriptionOverrides[toolName];
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
        const result: Record<string, string> = {};
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
        this.configService.update({ promptOverrides: this.getOverrides() });
    }
}
