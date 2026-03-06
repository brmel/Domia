import type { IPromptService } from '@domain/ports/IPromptService';
import { interpolate } from '@infrastructure/prompts/interpolate';
import { DEFAULT_LOOP_GUARD_THRESHOLD } from '@shared/defaults';

/** Number of loop-guard violations before the step is terminated. */
const LOOP_TERMINATION_VIOLATIONS = 2;

export class AgentLoopGuard {
    private readonly history: string[] = [];
    private readonly threshold: number;
    private readonly promptService: IPromptService;
    private violationCount = 0;

    constructor(threshold = DEFAULT_LOOP_GUARD_THRESHOLD, promptService: IPromptService) {
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

    /**
     * Records a loop violation and returns the warning message.
     * Must be called once per `isLoop()` === true occurrence.
     */
    recordViolation(toolName: string): string {
        this.violationCount++;
        return this.getWarning(toolName);
    }

    /**
     * True once the model has ignored enough loop warnings that continuing
     * is pointless. The step should be terminated immediately.
     */
    shouldTerminate(): boolean {
        return this.violationCount >= LOOP_TERMINATION_VIOLATIONS;
    }

    getLastLoopingArg(): string {
        return this.history[this.history.length - 1] ?? '(unknown)';
    }

    getWarning(toolName: string): string {
        const template = this.promptService.getPrompt('loopWarning');
        return interpolate(template, { toolName, threshold: this.threshold });
    }
}
