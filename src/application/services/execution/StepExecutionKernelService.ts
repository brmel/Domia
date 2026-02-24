import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation } from '@domain/ports';
import type { TestStep } from '@domain/ports';
import { WorkflowError } from '@domain/errors';
import type { WorkflowState } from '@domain/value-objects';
import { RunDurabilityService } from './RunDurabilityService';
import { RunBudgetPolicyService, type RunBudgetLimits } from './RunBudgetPolicyService';
import type { IRunLifecycleEngine } from './IRunLifecycleEngine';
import { RunLifecycleEngineService } from './RunLifecycleEngineService';
import { StepExecutor, type StepExecutionResult } from './StepExecutor';
import type { StepExecutionOptions } from './coordinators/RunCoordinator';
import type { RunTestOutput } from '../../dtos';
import type { IPersistenceAdapter } from '@domain/ports/IPersistenceAdapter';
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
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject('IRunLifecycleEngine') private readonly runLifecycleEngine: IRunLifecycleEngine = new RunLifecycleEngineService()
    ) {}

    async *execute(
        testRunId: string,
        executionGoal: string,
        browser: IBrowserAutomation,
        url: string,
        currentState: WorkflowState,
        executionOptions: StepExecutionOptions,
        runtime: KernelRuntime
    ): AsyncGenerator<RunTestOutput, KernelResult, unknown> {
        let estimatedTokensUsed = runtime.estimatedTokensUsed;

        const stepGen = this.executor.executeStep(
            testRunId,
            executionGoal,
            browser,
            url,
            currentState.stepNumber,
            {
                vision: executionOptions.vision,
                maxActions: executionOptions.maxActions,
            },
        );

        try {
            const emitStateUpdate = async (): Promise<RunTestOutput> => {
                await this.durability.checkpoint(testRunId, currentState, 'action_applied');
                return { type: 'state_updated', state: currentState };
            };

            const iterator = stepGen[Symbol.asyncIterator]();
            let next = await iterator.next();

            while (!next.done) {
                if (next.value.type === 'action') {
                    const action = next.value.action;
                    const assets = next.value.assets;

                    const step: TestStep = {
                        id: uuidv4(),
                        testRunId,
                        stepNumber: currentState.stepNumber + 1,
                        actionType: action.type,
                        actionPayload: action,
                        ...(assets ? { assets } : {}),
                        timestamp: new Date().toISOString()
                    };

                    const saveStepResult = await this.persistence.saveTestStep(step);
                    if (saveStepResult.isErr()) {
                        throw new WorkflowError(`Failed to persist test step: ${saveStepResult.error.message}`);
                    }

                    currentState = this.runLifecycleEngine.applyAction(currentState, action);
                    estimatedTokensUsed += Math.ceil(JSON.stringify(action).length / 4);
                    yield await emitStateUpdate();

                    this.throwIfBudgetExceeded(testRunId, runtime.budgetLimits, this.buildBudgetSnapshot({
                        actionsTaken: currentState.stepNumber,
                        runStartMs: runtime.runStartMs,
                        estimatedTokensUsed
                    }));

                    yield { type: 'acting', action };
                }

                next = await iterator.next();
            }

            const result = next.value;
            currentState = {
                ...currentState,
                status: 'validating'
            };
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

    throwIfBudgetExceeded(testRunId: string, limits: RunBudgetLimits, snapshot: {
        actionsTaken: number;
        elapsedMs: number;
        estimatedTokensUsed: number;
    }): void {
        const assessment = this.budgetPolicy.evaluate(testRunId, limits, snapshot);
        if (assessment.status !== 'exceeded') {
            return;
        }

        throw new WorkflowError(
            this.budgetPolicy.formatExceededMessage(limits, snapshot, assessment)
        );
    }
}
