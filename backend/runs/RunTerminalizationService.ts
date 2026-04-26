import { inject, injectable } from 'tsyringe';
import { WorkflowState } from '@domain/value-objects';
import type { RunId } from '@domain/value-objects/Brand';
import type { AgentOutcome } from '@domain/ports/IAgentRuntime';
import { RunState } from '@domain/enums';
import { RunDurabilityService } from './RunDurabilityService';
import { RunLifecycleManager } from './RunLifecycleManager';
import { ExecutionController } from '@backend/ExecutionController';
import type { RunOutput } from '@backend/dto';
import { isOutcomeSuccessful, summarizeOutcome } from './outcomes';

interface RunTerminalContext {
    readonly runId: RunId;
    readonly controller: ExecutionController;
    readonly completed: boolean;
    readonly terminalError: Error | null;
    readonly outcome: AgentOutcome | undefined;
    readonly currentState: WorkflowState;
}

@injectable()
export class RunTerminalizationService {
    constructor(
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunLifecycleManager) private readonly lifecycleManager: RunLifecycleManager,
    ) {}

    async recordMidRunFailure(runId: RunId, message: string): Promise<void> {
        await this.lifecycleManager.failRun(runId, message);
    }

    async *finalize(ctx: RunTerminalContext): AsyncGenerator<RunOutput, void, unknown> {
        const { runId, controller, terminalError, outcome } = ctx;
        let { currentState } = ctx;

        if (terminalError) {
            currentState = WorkflowState.applyTerminal(currentState, 'failed', terminalError.message);
            await this.durability.checkpoint(runId, currentState, 'terminal_failure');
            yield { type: 'error', error: terminalError };
            return;
        }

        if (controller.state === RunState.CANCELLED) {
            currentState = WorkflowState.applyTerminal(currentState, 'idle', 'cancelled');
            await this.durability.checkpoint(runId, currentState, 'terminal_cancelled');
            yield { type: 'cancelled', summary: 'Cancelled by user.' };
            await this.lifecycleManager.finalizeRun(runId, undefined, 'Cancelled by user.');
            return;
        }

        if (!ctx.completed) return;

        const success = outcome ? isOutcomeSuccessful(outcome) : false;
        const summary = outcome ? summarizeOutcome(outcome) : 'Unknown outcome';

        currentState = WorkflowState.applyTerminal(
            currentState,
            success ? 'completed' : 'failed',
            success ? undefined : summary,
        );
        await this.durability.checkpoint(
            runId,
            currentState,
            success ? 'terminal_success' : 'terminal_failure',
        );
        yield { type: 'completed', success, summary };
        await this.lifecycleManager.finalizeRun(runId, outcome, summary);
    }
}
