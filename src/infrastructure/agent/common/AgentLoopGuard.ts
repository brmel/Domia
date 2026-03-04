import type { IPromptService } from '@domain/ports/IPromptService';
import { interpolate } from '@infrastructure/prompts/PromptService';

export class AgentLoopGuard {
    private readonly history: string[] = [];
    private readonly threshold: number;
    private readonly promptService: IPromptService;

    constructor(threshold = 3, promptService: IPromptService) {
        this.threshold = threshold;
        this.promptService = promptService;
    }

    record(toolName: string, args: Record<string, unknown>): void {
        this.history.push(`${toolName}:${JSON.stringify(args)}`);
    }

    isLoop(): boolean {
        if (this.history.length < this.threshold) return false;
        const last = this.history.slice(-this.threshold);
        return last.every((s) => s === last[0]);
    }

    getWarning(toolName: string): string {
        const template = this.promptService.getPrompt('loopWarning');
        return interpolate(template, { toolName, threshold: this.threshold });
    }

    reset(): void {
        this.history.length = 0;
    }
}
