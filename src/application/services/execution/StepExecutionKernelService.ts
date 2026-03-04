import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation } from '@domain/ports';
import type { Step } from '@domain/ports';
import { WorkflowError } from '@domain/errors';
import { WorkflowState } from '@domain/value-objects';
import { RunDurabilityService } from './RunDurabilityService';
import { RunBudgetPolicyService, type RunBudgetLimits } from './RunBudgetPolicyService';
import { StepExecutor, type StepExecutionResult } from './StepExecutor';
import type { StepExecutionOptions } from './coordinators/RunCoordinator';
import type { RunOutput } from '../../dtos';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import { v4 as uuidv4 } from 'uuid';

export interface KernelRuntime {
    readonly budgetLimits: RunBudgetLimits;
    readonly runStartMs: number;
    estimatedTokensUsed: number;
}

export interface KernelResult {
    state: WorkflowState;
    result: StepExecutionResult;
    estimatedTokensUsed: number;
}

@injectable()
export class StepExecutionKernelService {
    constructor(
        @inject(StepExecutor) private readonly executor: StepExecutor,
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
        runtime: KernelRuntime
    ): AsyncGenerator<RunOutput, KernelResult, unknown> {
        let estimatedTokensUsed = runtime.estimatedTokensUsed;

        const stepGen = this.executor.executeStep(
            runId,
            executionGoal,
            automation,
            url,
            {
                vision: executionOptions.vision,
                maxActions: executionOptions.maxActions,
                platform: executionOptions.platform,
            },
        );

        try {
            const emitStateUpdate = async (): Promise<RunOutput> => {
                await this.durability.checkpoint(runId, currentState, 'action_applied');
                return { type: 'state_updated', state: currentState };
            };

            const iterator = stepGen[Symbol.asyncIterator]();
            let next = await iterator.next();

            while (!next.done) {
                if (next.value.type === 'thinking_chunk') {
                    yield { type: 'thinking_chunk', text: next.value.text } as RunOutput;
                } else if (next.value.type === 'action') {
                    const action = next.value.action;

                    const step: Step = {
                        id: uuidv4(),
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
                    estimatedTokensUsed += Math.ceil(JSON.stringify(action).length / 4);
                    yield await emitStateUpdate();

                    this.throwIfBudgetExceeded(runId, runtime.budgetLimits, this.buildBudgetSnapshot({
                        actionsTaken: currentState.stepNumber,
                        runStartMs: runtime.runStartMs,
                        estimatedTokensUsed
                    }));

                    yield { type: 'acting', action };
                }

                next = await iterator.next();
            }

            const result = next.value;
            currentState = WorkflowState.transitionTo(currentState, 'validating');
            yield { type: 'state_updated', state: currentState };

            return {
                state: currentState,
                result,
                estimatedTokensUsed
            };
        } catch (error) {
            const iteratorError = error instanceof Error ? error : new Error(String(error));
            if (iteratorError instanceof WorkflowError && iteratorError.message.startsWith('Run budget exceeded')) {
                throw iteratorError;
            }

            return {
                state: currentState,
                result: {
                    success: false,
                    terminal: 'error',
                    code: 'action_execution_error',
                    reason: `Step iterator failed: ${iteratorError.message}`
                },
                estimatedTokensUsed
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
        if (assessment.status !== 'exceeded') {
            return;
        }

        throw new WorkflowError(
            this.budgetPolicy.formatExceededMessage(limits, snapshot, assessment)
        );
    }
}
