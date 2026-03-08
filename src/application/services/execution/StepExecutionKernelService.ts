import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation, ITraceService, IStorageService, ILogger } from '@domain/ports';
import type { Step } from '@domain/ports';
import type { IAgentRunner, StepExecutionResult } from '@domain/ports/IAgentRunner';
import { WorkflowError } from '@domain/errors';
import { WorkflowState } from '@domain/value-objects';
import { RunState } from '@domain/enums';
import { RunDurabilityService } from './RunDurabilityService';
import { RunBudgetPolicyService, type RunBudgetLimits } from './RunBudgetPolicyService';
import type { StepExecutionOptions } from '@application/services/platform/platformUrlUtils';
import type { RunOutput } from '../../dtos';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import type { ExecutionController } from '../../ExecutionController';
import { DEFAULT_MAX_ACTIONS } from '@shared/defaults';
import { randomUUID } from 'crypto';

export type { StepExecutionResult } from '@domain/ports/IAgentRunner';

interface KernelRuntime {
    readonly budgetLimits: RunBudgetLimits;
    readonly runStartMs: number;
    estimatedTokensUsed: number;
}

interface KernelResult {
    state: WorkflowState;
    result: StepExecutionResult;
    estimatedTokensUsed: number;
}

@injectable()
export class StepExecutionKernelService {
    constructor(
        @inject('IAgentRunner') private readonly agentRunner: IAgentRunner,
        @inject('ITraceService') private readonly trace: ITraceService,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IRunRepository') private readonly persistence: IRunRepository,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService
    ) {}

    async *execute(
        runId: string,
        executionGoal: string,
        automation: IStructuredAutomation,
        url: string,
        currentState: WorkflowState,
        executionOptions: StepExecutionOptions,
        runtime: KernelRuntime,
        controller?: ExecutionController
    ): AsyncGenerator<RunOutput, KernelResult, unknown> {
        let estimatedTokensUsed = runtime.estimatedTokensUsed;

        await this.trace.startTrace(runId);

        const config: import('@domain/ports/IAgentRunner').StepRunnerConfig = {
            runId,
            stepGoal: executionGoal,
            url,
            maxActions: executionOptions.maxActions ?? DEFAULT_MAX_ACTIONS,
            vision: executionOptions.vision,
            platform: executionOptions.platform,
            ...(executionOptions.extras ? { extras: executionOptions.extras } : {}),
        };
        if (executionOptions.recording) {
            (config as { recording: typeof executionOptions.recording }).recording = executionOptions.recording;
        }

        const stepGen = this.agentRunner.executeStep(config, automation);

        try {
            const emitStateUpdate = async (): Promise<RunOutput> => {
                await this.durability.checkpoint(runId, currentState, 'action_applied');
                return { type: 'state_updated', state: currentState };
            };

            const cancelResult = (reason: string): KernelResult => ({
                state: currentState,
                result: { success: false, terminal: 'error', code: 'user_cancelled', reason },
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

                    if (controller?.isStopped()) return cancelResult('Run cancelled by user.');

                    const step: Step = {
                        id: randomUUID(),
                        runId,
                        stepNumber: currentState.stepNumber + 1,
                        actionType: action.type,
                        actionPayload: action,
                        timestamp: new Date().toISOString()
                    };

                    const saveStepResult = await this.persistence.saveStep(step);
                    if (saveStepResult.isErr()) {
                        throw new WorkflowError(`Failed to persist step: ${saveStepResult.error.message}`);
                    }

                    currentState = WorkflowState.applyAction(currentState, action);
                    yield await emitStateUpdate();

                    this.throwIfBudgetExceeded(runId, runtime.budgetLimits, this.buildBudgetSnapshot({
                        actionsTaken: currentState.stepNumber,
                        runStartMs: runtime.runStartMs,
                        estimatedTokensUsed
                    }));

                    if (controller?.state === RunState.PAUSED) {
                        await controller.waitForResume();
                        if (controller.isStopped()) return cancelResult('Run cancelled while paused mid-step.');
                    }
                }

                next = await stepGen.next();
            }

            const result = next.value;
            currentState = WorkflowState.transitionTo(currentState, 'validating');
            yield { type: 'state_updated', state: currentState };

            return { state: currentState, result, estimatedTokensUsed };
        } catch (error) {
            const iteratorError = error instanceof Error ? error : new Error(String(error));
            if (iteratorError instanceof WorkflowError) throw iteratorError;
            return {
                state: currentState,
                result: {
                    success: false,
                    terminal: 'error',
                    code: 'action_execution_error',
                    reason: `Step iterator failed: ${iteratorError.message}`
                },
                estimatedTokensUsed,
            };
        }
    }

    buildBudgetSnapshot(params: {
        actionsTaken: number;
        runStartMs: number;
        estimatedTokensUsed: number;
    }): {
        actionsTaken: number;
        elapsedMs: number;
        estimatedTokensUsed: number;
    } {
        return {
            actionsTaken: params.actionsTaken,
            elapsedMs: Date.now() - params.runStartMs,
            estimatedTokensUsed: params.estimatedTokensUsed
        };
    }

    throwIfBudgetExceeded(runId: string, limits: RunBudgetLimits, snapshot: {
        actionsTaken: number;
        elapsedMs: number;
        estimatedTokensUsed: number;
    }): void {
        const assessment = this.budgetPolicy.evaluate(runId, limits, snapshot);
        if (assessment.status !== 'exceeded') return;
        throw new WorkflowError(
            this.budgetPolicy.formatExceededMessage(limits, snapshot, assessment)
        );
    }
}
