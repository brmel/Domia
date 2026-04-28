import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation, ITraceService, IStorageService, ILogger } from '@domain/ports';
import type { Step } from '@domain/ports';
import type { IAgentRuntime, AgentOutcome, AgentInput } from '@domain/ports/IAgentRuntime';
import { WorkflowError } from '@domain/errors';
import { WorkflowState } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { RunState } from '@domain/enums';
import { RunDurabilityService } from './RunDurabilityService';
import type { RunBudgetLimits } from './RunBudgetPolicyService';
import type { StepExecutionOptions } from '@backend/platform/platformUrlUtils';
import type { RunOutput } from '@backend/dto';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import type { ExecutionController } from '@backend/ExecutionController';
import { DEFAULT_MAX_ACTIONS } from '@shared/defaults';
import { randomUUID } from 'crypto';

interface KernelRuntime {
    readonly budgetLimits: RunBudgetLimits;
    readonly runStartMs: number;
    estimatedTokensUsed: number;
}

interface KernelResult {
    state: WorkflowState;
    outcome: AgentOutcome;
    estimatedTokensUsed: number;
    suspendedReason?: string;
}

@injectable()
export class StepExecutionKernelService {
    constructor(
        @inject('IAgentRuntime') private readonly agentRuntime: IAgentRuntime,
        @inject('ITraceService') private readonly trace: ITraceService,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IRunRepository') private readonly persistence: IRunRepository,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
    ) {}

    async *execute(
        runId: string,
        executionGoal: string,
        automation: IStructuredAutomation,
        url: string,
        currentState: WorkflowState,
        executionOptions: StepExecutionOptions,
        runtime: KernelRuntime,
        controller?: ExecutionController,
    ): AsyncGenerator<RunOutput, KernelResult, unknown> {
        let estimatedTokensUsed = runtime.estimatedTokensUsed;

        await this.trace.startTrace(runId);

        const input: AgentInput = {
            runId,
            stepGoal: executionGoal,
            url,
            maxActions: executionOptions.maxActions ?? DEFAULT_MAX_ACTIONS,
            vision: executionOptions.vision,
            platform: executionOptions.platform,
            persistArtifacts: executionOptions.persistArtifacts,
            ...(executionOptions.extras ? { extras: executionOptions.extras } : {}),
            ...(executionOptions.recording ? { recording: executionOptions.recording } : {}),
        };

        const stepGen = this.agentRuntime.run(input, automation);

        try {
            const emitStateUpdate = async (): Promise<RunOutput> => {
                await this.durability.checkpoint(runId, currentState, CheckpointReason.ActionApplied);
                return { type: 'state_updated', state: currentState };
            };

            const cancelOutcome = (summary: string): KernelResult => ({
                state: currentState,
                outcome: { kind: 'stopped', reason: 'cancelled', summary },
                estimatedTokensUsed,
            });

            let next = await stepGen.next();

            while (!next.done) {
                const event = next.value;

                if (event.type === 'thinking_chunk') {
                    yield { type: 'thinking_chunk', text: event.text } as RunOutput;
                } else {
                    try {
                        await this.storage.saveStepTrace(runId, event.actionIndex, event.trace);
                    } catch {
                        this.logger.warn(`[Kernel] Failed to save step trace for action ${event.actionIndex}`);
                    }

                    const action = event.action;
                    yield { type: 'acting', action };

                    if (controller?.isStopped()) return cancelOutcome('Run cancelled by user.');

                    const step: Step = {
                        id: randomUUID(),
                        runId,
                        stepNumber: currentState.stepNumber + 1,
                        actionType: action.type,
                        actionPayload: action,
                        timestamp: new Date().toISOString(),
                    };

                    const saveStepResult = await this.persistence.saveStep(step);
                    if (saveStepResult.isErr()) {
                        throw new WorkflowError(`Failed to persist step: ${saveStepResult.error.message}`);
                    }

                    currentState = WorkflowState.applyAction(currentState, action);
                    yield await emitStateUpdate();

                    if (controller?.state === RunState.PAUSED) {
                        await controller.waitForResume();
                        if (controller.isStopped()) return cancelOutcome('Run cancelled while paused mid-step.');
                    }

                    if (controller?.hasPendingSuspendRequest()) {
                        const req = controller.consumeSuspendRequest()!;
                        await stepGen.return(undefined as never).catch(() => undefined);
                        return {
                            state: currentState,
                            outcome: { kind: 'stopped', reason: 'cancelled', summary: `Suspended: ${req.reason}` },
                            estimatedTokensUsed,
                            suspendedReason: req.reason,
                        };
                    }
                }

                next = await stepGen.next();
            }

            const outcome = next.value;
            currentState = WorkflowState.transitionTo(currentState, 'validating');
            yield { type: 'state_updated', state: currentState };

            return { state: currentState, outcome, estimatedTokensUsed };
        } catch (error) {
            const iteratorError = error instanceof Error ? error : new Error(String(error));
            if (iteratorError instanceof WorkflowError) throw iteratorError;
            return {
                state: currentState,
                outcome: { kind: 'error', cause: iteratorError },
                estimatedTokensUsed,
            };
        }
    }
}
