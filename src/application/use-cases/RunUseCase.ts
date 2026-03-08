import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation } from '@domain/ports';
import { ExecutionGraph, UrlFactory, WorkflowState } from '@domain/value-objects';
import type { WorkflowExecutionGraph } from '@domain/value-objects/ExecutionGraph';
import type { RunId } from '@domain/value-objects/Brand';
import { ExecutionController } from '../ExecutionController';
import { WorkflowError } from '@domain/errors';
import { RunLifecycleManager } from '../services/RunLifecycleManager';
import { RunInput, RunOutput } from '../dtos';
import { RunState } from '@domain/enums';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '../services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '../services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '../services/execution/CheckpointCompactionService';
import { ReplanningPolicyService } from '../services/execution/ReplanningPolicyService';
import { assessObjectiveCompletion } from '../services/execution/ObjectiveCompletionPolicyService';
import { StepExecutionKernelService } from '../services/execution/StepExecutionKernelService';
import type { StepExecutionResult } from '../services/execution/StepExecutor';

import { resolveUrlFromConfig, resolveLaneKeyFromConfig, buildExecutionOptions } from '../services/platform/platformUrlUtils';
import { RuntimeReadinessPolicyService } from '../services/hardening/RuntimeReadinessPolicyService';
import { Plan, PlanItem } from '@domain/entities/Plan';
import type { ILogger } from '@domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';
import { nanoid } from 'nanoid';

import type { RunLifecycleState } from '@domain/value-objects/RunLifecycle';
import type { PlatformSession } from '../services/platform/PlatformSession';
import type { ReplanningTrigger } from '../services/execution/ReplanningPolicyService';

interface RunExecutionContext {
    readonly session?: PlatformSession;
    readonly shouldNavigate?: boolean;
    readonly disposeSessionOnComplete?: boolean;
}


@injectable()
export class RunUseCase {
    constructor(
        @inject(RunLifecycleManager) private lifecycleManager: RunLifecycleManager,
        @inject('ITraceService') private trace: import('@domain/ports/ITraceService').ITraceService,
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory,
        @inject('IRunExecutionLaneService') private readonly laneService: RunExecutionLaneService,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(CheckpointCompactionService) private readonly checkpointCompaction: CheckpointCompactionService,
        @inject(ReplanningPolicyService) private readonly replanningPolicy: ReplanningPolicyService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject('ILogger') private logger: ILogger,
        @inject(StepExecutionKernelService) private readonly kernel: StepExecutionKernelService,
    ) {}

    async *execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext
    ): AsyncGenerator<RunOutput, void, unknown> {
        const url = runContext?.session?.executionUrl ?? resolveUrlFromConfig(input.platformConfig);

        const readinessDecision = this.readinessPolicy.assess(input, url);
        if (readinessDecision.blocked) {
            yield { type: 'error', error: new WorkflowError(readinessDecision.message ?? 'Readiness gate blocked the run.') };
            return;
        }

        const laneKey = resolveLaneKeyFromConfig(input.platformConfig);
        const releaseLane = await this.laneService.acquire(laneKey);

        const initResult = await this.lifecycleManager.initializeRun(url, input.prompt);
        if (initResult.isErr()) {
            releaseLane();
            yield { type: 'error', error: initResult.error };
            return;
        }
        const runId = initResult.value;
        let runLifecycle: RunLifecycleState = 'initialized';
        const budgetLimits = this.budgetPolicy.resolveLimits(input.options);
        const runStartMs = Date.now();
        let estimatedTokensUsed = 0;

        let automation: IStructuredAutomation;
        let disposeSession: (() => Promise<void>) | undefined;
        let shouldNavigate = true;
        let ownsSession = false;
        let sessionExtras: Readonly<Record<string, unknown>> | undefined;
        
        try {
            const session = runContext?.session ?? await this.sessionFactory.createSession(input);
            automation = session.automation;
            disposeSession = session.dispose;
            shouldNavigate = runContext?.shouldNavigate ?? session.shouldNavigate;
            sessionExtras = session.extras;
            ownsSession = runContext?.session
                ? (runContext.disposeSessionOnComplete ?? false)
                : true;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            yield { type: 'error', error: new WorkflowError(`Error initializing session: ${err.message}`) };
            if (disposeSession && ownsSession) {
                await disposeSession();
            }
            releaseLane();
            return;
        }

        let currentState = WorkflowState.initial();

        await this.durability.checkpoint(runId, currentState, 'run_initialized');
        yield { type: 'started', runId };
        let completed = false;
        let finalSummary: string | undefined;
        let hasUnresolvedVerificationFailure = false;
        let consecutiveStepFailures = 0;
        let replanCount = 0;
        let terminalError: Error | null = null;
        const maxConsecutiveStepFailures = this.replanningPolicy.resolveLimits().maxReplansPerRun + 1;

        try {
            const urlResult = UrlFactory.create(url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);

            if (shouldNavigate) {
                const navResult = await automation.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await automation.waitForReady();
            }

            currentState = WorkflowState.transitionTo(currentState, 'thinking');
            yield { type: 'state_updated', state: currentState };
            runLifecycle = this.durability.transition(runId, runLifecycle, 'executing');

            const now = new Date();
            const plan: Plan = {
                id: nanoid(),
                goal: input.prompt,
                status: 'executing',
                createdAt: now,
                updatedAt: now,
                items: [{ id: nanoid(), description: input.prompt, status: 'pending', type: 'app' }]
            };

            let executionGraph = ExecutionGraph.fromPlan(plan);

            currentState = WorkflowState.transitionTo(currentState, 'thinking', { plan, executionGraph });
            yield { type: 'state_updated', state: currentState };
            await this.durability.checkpoint(runId, currentState, 'plan_ready');

            while (true) {
                const nextNode = ExecutionGraph.selectNextReadyNode(executionGraph);
                if (!nextNode) {
                    break;
                }

                const i = plan.items.findIndex((candidate) => candidate.id === nextNode.id);
                if (i < 0) {
                    throw new WorkflowError(`Execution graph node not found in plan items: ${nextNode.id}`);
                }

                const item = plan.items[i];
                if (!item) continue;
                const executionGoal = item.description;

                const controlFlow = await this.applyControllerFlow({
                    controller,
                    runId,
                    runLifecycle,
                    currentState
                });
                runLifecycle = controlFlow.runLifecycle;
                if (controlFlow.cancelled) {
                    break;
                }

                this.kernel.throwIfBudgetExceeded(runId, budgetLimits, this.kernel.buildBudgetSnapshot({
                    actionsTaken: currentState.stepNumber,
                    runStartMs,
                    estimatedTokensUsed
                }));

                const runningItem = PlanItem.activate(item);
                const updatedItems = [...plan.items];
                updatedItems[i] = runningItem;
                executionGraph = ExecutionGraph.updateNodeState(executionGraph, runningItem.id, 'running');
                currentState = WorkflowState.transitionTo(currentState, 'observing', {
                    activeItemId: runningItem.id,
                    activeNodeId: runningItem.id,
                    executionGraph,
                    plan: { ...plan, items: updatedItems }
                });
                yield { type: 'state_updated', state: currentState };

                const executionOptions = {
                    ...buildExecutionOptions(input.options, input.platformConfig.platform),
                    ...(sessionExtras ? { extras: sessionExtras } : {}),
                };

                const stepKernel = this.kernel.execute(
                    runId,
                    executionGoal,
                    automation,
                    url,
                    currentState,
                    executionOptions,
                    {
                        budgetLimits,
                        runStartMs,
                        estimatedTokensUsed,
                    },
                    controller
                );

                const kernelResult = yield* stepKernel;
                currentState = kernelResult.state;
                estimatedTokensUsed = kernelResult.estimatedTokensUsed;
                const { result } = kernelResult;

                // If the controller was stopped during the step, exit immediately before
                // replanning/failure processing — finalizeExecution will emit 'cancelled'.
                if (controller.isStopped()) {
                    break;
                }

                if (result && result.success) {
                    const successItem = PlanItem.complete(runningItem);
                    const successItems = [...updatedItems];
                    successItems[i] = successItem;
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, successItem.id, 'completed');
                    currentState = WorkflowState.transitionTo(
                        WorkflowState.clearActiveItem(currentState),
                        'idle',
                        { executionGraph, plan: { ...plan, items: successItems } }
                    );
                    yield { type: 'state_updated', state: currentState };
                    consecutiveStepFailures = 0;
                    hasUnresolvedVerificationFailure = false;
                    finalSummary = undefined;
                } else {
                    const failureOutcome = yield* this.handleStepFailure({
                        runId, result, runningItem, plan, updatedItems, itemIndex: i,
                        replanCount, consecutiveStepFailures, maxConsecutiveStepFailures
                    }, currentState, executionGraph);

                    currentState = failureOutcome.state;
                    executionGraph = failureOutcome.executionGraph;
                    replanCount = failureOutcome.replanCount;
                    consecutiveStepFailures = failureOutcome.consecutiveStepFailures;
                    finalSummary = failureOutcome.finalSummary;
                    hasUnresolvedVerificationFailure = true;
                    if (failureOutcome.shouldHalt) break;
                }
            }

            const completionAssessment = assessObjectiveCompletion({
                plan,
                ...(currentState.executionGraph ? { executionGraph: currentState.executionGraph } : {}),
                hasUnresolvedVerificationFailure,
                ...(finalSummary ? { failureSummary: finalSummary } : {})
            });

            completed = true;
            hasUnresolvedVerificationFailure = !completionAssessment.success;
            finalSummary = completionAssessment.summary;

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            await this.lifecycleManager.failRun(runId, msg);
            terminalError = error instanceof Error ? error : new Error(msg);
        } finally {
            if (disposeSession && ownsSession) {
                await disposeSession().catch(err =>
                    this.logger.warn(`[RunUseCase] Error during session cleanup: ${String(err)}`)
                );
            }
            releaseLane();
            await this.trace.endTrace();

            yield* this.finalizeExecution({
                runId, controller, completed, terminalError,
                hasUnresolvedVerificationFailure, finalSummary,
                currentState, runLifecycle
            });
        }
    }

    private async *handleStepFailure(
        ctx: {
            readonly runId: RunId;
            readonly result: StepExecutionResult | undefined;
            readonly runningItem: PlanItem;
            readonly plan: Plan;
            readonly updatedItems: PlanItem[];
            readonly itemIndex: number;
            readonly replanCount: number;
            readonly consecutiveStepFailures: number;
            readonly maxConsecutiveStepFailures: number;
        },
        currentState: WorkflowState,
        executionGraph: WorkflowExecutionGraph
    ): AsyncGenerator<RunOutput, {
        state: WorkflowState;
        executionGraph: WorkflowExecutionGraph;
        replanCount: number;
        consecutiveStepFailures: number;
        finalSummary: string;
        shouldHalt: boolean;
    }, unknown> {
        const { result, runningItem, plan, updatedItems, itemIndex } = ctx;
        const errorMsg = result && !result.success ? `${result.code}: ${result.reason}` : 'unknown_error: Unknown error';
        const replanningTrigger = result && !result.success ? RunUseCase.mapFailureCodeToTrigger(result.code) : undefined;
        const replanningAssessment = this.replanningPolicy.assess({
            runId: ctx.runId,
            replanCount: ctx.replanCount,
            ...(replanningTrigger ? { trigger: replanningTrigger } : {})
        });

        if (replanningAssessment.shouldReplan) {
            this.logger.info('[ReplanningPolicyService] Replanning approved (active mode)', {
                runId: ctx.runId,
                trigger: replanningTrigger,
                replanCount: ctx.replanCount,
                reason: replanningAssessment.reason
            });
        }

        const replanningLimits = this.replanningPolicy.resolveLimits();
        yield {
            type: 'replanning',
            telemetry: {
                runId: ctx.runId,
                ...(replanningTrigger ? { trigger: replanningTrigger } : {}),
                status: replanningAssessment.shouldReplan ? 'executed' : 'suppressed',
                reason: replanningAssessment.reason,
                mode: replanningAssessment.mode,
                replanCount: ctx.replanCount,
                maxReplansPerRun: replanningLimits.maxReplansPerRun
            }
        };

        const failedItem = PlanItem.fail(runningItem);
        const newItems = [...updatedItems];
        newItems[itemIndex] = failedItem;
        const updatedGraph = ExecutionGraph.updateNodeState(executionGraph, failedItem.id, 'failed');
        const updatedState = WorkflowState.transitionTo(
            WorkflowState.clearActiveItem(currentState),
            'failed',
            { error: errorMsg, executionGraph: updatedGraph, plan: { ...plan, items: newItems } }
        );
        yield { type: 'state_updated', state: updatedState };

        const newReplanCount = ctx.replanCount + 1;
        const newConsecutiveFailures = ctx.consecutiveStepFailures + 1;

        this.logger.info('[RunUseCase] Step failed verification', {
            runId: ctx.runId,
            error: errorMsg,
            planItemId: runningItem.id,
            planItemDescription: runningItem.description
        });

        let finalSummary = `Verification failed: ${errorMsg}`;
        let shouldHalt = false;

        if (newConsecutiveFailures >= ctx.maxConsecutiveStepFailures) {
            this.logger.warn('[RunUseCase] Halting run after consecutive failed steps', {
                runId: ctx.runId,
                consecutiveStepFailures: newConsecutiveFailures,
                maxConsecutiveStepFailures: ctx.maxConsecutiveStepFailures
            });
            finalSummary = `Stopped after ${newConsecutiveFailures} consecutive failed steps: ${errorMsg}`;
            shouldHalt = true;
        }

        return {
            state: updatedState,
            executionGraph: updatedGraph,
            replanCount: newReplanCount,
            consecutiveStepFailures: newConsecutiveFailures,
            finalSummary,
            shouldHalt
        };
    }

    private async *finalizeExecution(ctx: {
        readonly runId: RunId;
        readonly controller: ExecutionController;
        readonly completed: boolean;
        readonly terminalError: Error | null;
        readonly hasUnresolvedVerificationFailure: boolean;
        readonly finalSummary: string | undefined;
        readonly currentState: WorkflowState;
        readonly runLifecycle: RunLifecycleState;
    }): AsyncGenerator<RunOutput, void, unknown> {
        const { runId, controller, completed, terminalError, hasUnresolvedVerificationFailure, finalSummary } = ctx;
        let { currentState, runLifecycle } = ctx;

        if (terminalError) {
            currentState = WorkflowState.applyTerminal(currentState, 'failed', terminalError.message);
            runLifecycle = this.durability.transition(runId, runLifecycle, 'failed');
            await this.durability.checkpoint(runId, currentState, 'terminal_failure');
            yield { type: 'error', error: terminalError };
        } else if (controller.state === RunState.CANCELLED) {
            currentState = WorkflowState.applyTerminal(currentState, 'idle', 'cancelled');
            runLifecycle = this.durability.transition(runId, runLifecycle, 'cancelled');
            await this.durability.checkpoint(runId, currentState, 'terminal_cancelled');
            yield { type: 'cancelled', summary: 'Cancelled by user.' };
            await this.lifecycleManager.finalizeRun(runId, false, 'Cancelled by user.');
        } else if (completed) {
            currentState = WorkflowState.applyTerminal(
                currentState,
                hasUnresolvedVerificationFailure ? 'failed' : 'completed',
                hasUnresolvedVerificationFailure ? finalSummary : undefined
            );
            runLifecycle = this.durability.transition(runId, runLifecycle, hasUnresolvedVerificationFailure ? 'failed' : 'completed');
            await this.durability.checkpoint(runId, currentState, hasUnresolvedVerificationFailure ? 'terminal_failure' : 'terminal_success');
            const isGlobalSuccess = !hasUnresolvedVerificationFailure;
            yield { type: 'completed', success: isGlobalSuccess, ...(finalSummary ? { summary: finalSummary } : {}) };
            await this.lifecycleManager.finalizeRun(runId, isGlobalSuccess, finalSummary);
        }

        await this.logCheckpointCompactionSummary(runId);
    }

    private static mapFailureCodeToTrigger(code: string): ReplanningTrigger | undefined {
        switch (code) {
            case 'loop_detected':
                return 'loop_detected';
            case 'action_execution_error':
                return 'action_execution_error';
            case 'assertion_fail':
            case 'agent_fail':
                return 'assertion_fail';
            case 'max_actions_reached':
                return 'max_actions_reached';
            case 'perception_error':
            case 'llm_error':
                return undefined;
            default:
                return undefined;
        }
    }

    private async applyControllerFlow(input: {
        controller: ExecutionController;
        runId: string;
        runLifecycle: RunLifecycleState;
        currentState: WorkflowState;
    }): Promise<{ runLifecycle: RunLifecycleState; cancelled: boolean }> {
        let runLifecycle = input.runLifecycle;

        if (input.controller.state === RunState.PAUSED) {
            runLifecycle = this.durability.transition(input.runId, runLifecycle, 'paused');
            await this.durability.checkpoint(input.runId, input.currentState, 'pause_requested');
            await input.controller.waitForResume();
            runLifecycle = this.durability.transition(input.runId, runLifecycle, 'executing');
            await this.durability.checkpoint(input.runId, input.currentState, 'resume_requested');
        }

        return {
            runLifecycle,
            cancelled: input.controller.state === RunState.CANCELLED
        };
    }

    private async logCheckpointCompactionSummary(runId: string): Promise<void> {
        const checkpoints = await this.durability.getCheckpointRecords(runId);
        const compactedView = this.checkpointCompaction.compact(runId, checkpoints);

        this.logger.debug('[RunUseCase] Checkpoint compaction summary', {
            runId,
            totalCheckpoints: checkpoints.length,
            compactedCheckpoints: compactedView.compacted.length,
            latestReason: compactedView.latest?.reason
        });
    }

}
