import { inject, injectable } from 'tsyringe';
import type { IPromptService, PromptKey } from '@domain/ports/IPromptService';

@injectable()
export class PromptsAppService {
    constructor(
        @inject('IPromptService') private readonly promptService: IPromptService,
    ) {}

    getAllPrompts() {
        return this.promptService.getAllPrompts();
    }

    getAllToolDescriptions() {
        return this.promptService.getAllToolDescriptions();
    }

    getOverrides() {
        return this.promptService.getOverrides();
    }

    setPrompt(key: PromptKey, value: string): void {
        this.promptService.setPromptOverride(key, value);
    }

    setToolDescription(toolName: string, value: string): void {
        this.promptService.setToolDescriptionOverride(toolName, value);
    }

    resetPrompt(key: PromptKey): void {
        this.promptService.resetPrompt(key);
    }

    resetToolDescription(toolName: string): void {
        this.promptService.resetToolDescription(toolName);
    }

    resetAll(): void {
        this.promptService.resetAll();
    }
}