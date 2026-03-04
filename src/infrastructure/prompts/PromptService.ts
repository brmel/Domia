import { injectable, inject } from 'tsyringe';
import fs from 'fs';
import path from 'path';
import type { IConfigService } from '@domain/ports/IConfigService';
import type {
    IPromptService,
    PromptKey,
    PromptOverrides,
} from '@domain/ports/IPromptService';

const DEFAULTS_DIR = path.resolve(__dirname, 'defaults');

const PROMPT_FILES: Record<PromptKey, string> = {
    systemInstruction: 'system-instruction.md',
    stepGoal: 'step-goal.md',
    loopWarning: 'loop-warning.md',
    targetingBoth: 'targeting-both.md',
    targetingRefOnly: 'targeting-ref-only.md',
    targetingMouseOnly: 'targeting-mouse-only.md',
};

function loadFile(filename: string): string {
    try {
        return fs.readFileSync(path.join(DEFAULTS_DIR, filename), 'utf-8').trim();
    } catch {
        return '';
    }
}

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
        this.defaultPrompts = {} as Record<PromptKey, string>;
        for (const [key, file] of Object.entries(PROMPT_FILES)) {
            this.defaultPrompts[key as PromptKey] = loadFile(file);
        }

        const toolDescContent = loadFile('tool-descriptions.md');
        this.defaultToolDescriptions = parseToolDescriptions(toolDescContent);

        const config = this.configService.get();
        const overrides = (config as unknown as { promptOverrides?: PromptOverrides }).promptOverrides;
        this.promptOverrides = { ...overrides?.prompts };
        this.toolDescriptionOverrides = { ...overrides?.toolDescriptions };
    }

    getPrompt(key: PromptKey): string {
        return this.promptOverrides[key] ?? this.defaultPrompts[key] ?? '';
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

export function interpolate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        return key in vars ? String(vars[key]) : `{{${key}}}`;
    });
}
