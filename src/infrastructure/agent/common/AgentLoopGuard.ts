export class AgentLoopGuard {
    private readonly history: string[] = [];
    private readonly threshold: number;

    constructor(threshold = 3) {
        this.threshold = threshold;
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
        return `LOOP DETECTED: You have called ${toolName} with the same arguments ${this.threshold} times. The page state has not changed. Choose a DIFFERENT action or call 'fail' if the goal cannot be achieved.`;
    }

    reset(): void {
        this.history.length = 0;
    }
}
