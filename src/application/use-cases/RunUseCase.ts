import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation } from '../../domain/ports';
import { ExecutionGraph, UrlFactory, WorkflowState } from '../../domain/value-objects';
import type { WorkflowExecutionGraph } from '../../domain/value-objects/ExecutionGraph';
import type { RunId } from '../../domain/value-objects/Brand';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { RunLifecycleManager } from '../services/RunLifecycleManager';
import { RunInput, RunOutput } from '../dtos';
import { RunState } from '../../domain/enums/RunState';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '../services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '../services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '../services/execution/CheckpointCompactionService';
import { RecoveryEligibilityService } from '../services/execution/RecoveryEligibilityService';
import { ManualRecoveryBootstrapService } from '../services/execution/ManualRecoveryBootstrapService';
import { RecoveryReplayService } from '../services/execution/RecoveryReplayService';
import { ReplanningPolicyService } from '../services/execution/ReplanningPolicyService';
import { ObjectiveCompletionPolicyService } from '../services/execution/ObjectiveCompletionPolicyService';
import { StepExecutionKernelService } from '../services/execution/StepExecutionKernelService';
import type { StepExecutionResult } from '../services/execution/StepExecutor';

import { BranchRollbackService } from '../services/execution/BranchRollbackService';
import { PlanningCoordinator } from '../services/execution/coordinators/PlanningCoordinator';
import { RunCoordinator } from '../services/execution/coordinators/RunCoordinator';
import { ReplanningCoordinator } from '../services/execution/coordinators/ReplanningCoordinator';
import {
    resolveRecoveryContext as resolveRecoveryContextForRun,
    replayRecoveryActions as replayRecoveryActionsForRun,
    type RunRecoveryDependencies,
    type RecoveryBootstrapContext
} from '../services/execution/RunRecoveryOrchestration';
import { RuntimeReadinessPolicyService } from '../services/hardening/RuntimeReadinessPolicyService';
import { Plan, PlanItem } from '@domain/entities/Plan';
import type { ILogger } from '../../domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';

import type { RunLifecycleState } from '@domain/value-objects/RunLifecycle';
import type { PlatformSession } from '../services/platform/PlatformSession';

export interface RunExecutionContext {
    readonly session?: PlatformSession;
    readonly shouldNavigate?: boolean;
    readonly disposeSessionOnComplete?: boolean;
}


@injectable()
export class RunUseCase {
    constructor(
        @inject(RunLifecycleManager) private lifecycleManager: RunLifecycleManager,
        @inject('ITraceService') private trace: import('../../domain/ports/ITraceService').ITraceService,
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory,
        @inject('IRunExecutionLaneService') private readonly laneService: RunExecutionLaneService,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(CheckpointCompactionService) private readonly checkpointCompaction: CheckpointCompactionService,
        @inject(RecoveryEligibilityService) private readonly recoveryEligibility: RecoveryEligibilityService,
        @inject(ManualRecoveryBootstrapService) private readonly recoveryBootstrap: ManualRecoveryBootstrapService,
        @inject(RecoveryReplayService) private readonly recoveryReplay: RecoveryReplayService,
        @inject(ReplanningPolicyService) private readonly replanningPolicy: ReplanningPolicyService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject('ILogger') private logger: ILogger,
        @inject(StepExecutionKernelService) private readonly kernel: StepExecutionKernelService,
        @inject('IRunRepository') private persistence: import('../../domain/ports').IRunRepository,
        @inject(PlanningCoordinator) private readonly planningCoordinator: PlanningCoordinator = new PlanningCoordinator(),
        @inject(RunCoordinator) private readonly runCoordinator: RunCoordinator = new RunCoordinator(),
        @inject(ReplanningCoordinator) private readonly replanningCoordinator: ReplanningCoordinator = new ReplanningCoordinator(),
        @inject(BranchRollbackService) private readonly branchRollback: BranchRollbackService = new BranchRollbackService(),
        @inject(ObjectiveCompletionPolicyService) private readonly objectiveCompletionPolicy: ObjectiveCompletionPolicyService = new ObjectiveCompletionPolicyService()
    ) {}

    private get recoveryDeps(): RunRecoveryDependencies {
        return {
            persistence: this.persistence,
            durability: this.durability,
            checkpointCompaction: this.checkpointCompaction,
            branchRollback: this.branchRollback,
            recoveryEligibility: this.recoveryEligibility,
            recoveryBootstrap: this.recoveryBootstrap,
            recoveryReplay: this.recoveryReplay,
            logger: this.logger
        };
    }

    async *execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext
    ): AsyncGenerator<RunOutput, void, unknown> {
        const url = this.runCoordinator.resolveExecutionUrl(input, runContext);

        const readinessDecision = this.readinessPolicy.assess(input, url);
        if (readinessDecision.blocked) {
            yield { type: 'error', error: new WorkflowError(readinessDecision.message ?? 'Readiness gate blocked the run.') };
            return;
        }

        const laneKey = this.runCoordinator.resolveLaneKey(input);
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
        const recoveryContext = await resolveRecoveryContextForRun(this.recoveryDeps, input);

        let automation: IStructuredAutomation;
        let disposeSession: (() => Promise<void>) | undefined;
        let shouldNavigate = true;
        let ownsSession = false;
        
        try {
            const session = runContext?.session ?? await this.sessionFactory.createSession(input);
            automation = session.automation;
            disposeSession = session.dispose;
            shouldNavigate = runContext?.shouldNavigate ?? session.shouldNavigate;
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

        let currentState = recoveryContext?.state ?? WorkflowState.initial();
        const recoveryTargetStepNumber = recoveryContext?.state.stepNumber ?? 0;

        if (recoveryContext) {
            currentState = {
                ...currentState,
                stepNumber: 0,
                history: []
            };
        }

        const resumedPlan = recoveryContext?.plan;
        const startPlanIndex = recoveryContext?.startPlanIndex ?? 0;

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

            yield { type: 'thinking' };

            if (shouldNavigate) {
                const navResult = await automation.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await automation.waitForReady();
            }

            if (recoveryContext) {
                const replayResult = yield* this.performRecoveryReplay(
                    runId, recoveryContext, automation, controller, currentState, recoveryTargetStepNumber
                );

                if (replayResult.cancelled) return;
                currentState = replayResult.state;
            }

            currentState = WorkflowState.transitionTo(currentState, 'planning');
            yield { type: 'state_updated', state: currentState };
            yield { type: 'thinking' };
            runLifecycle = this.durability.transition(runId, runLifecycle, 'planning');
            const plan: Plan = resumedPlan
                ?? this.planningCoordinator.buildSingleStepPlan(
                    input.prompt
                );

            if (resumedPlan) {
                this.logger.info('[RunUseCase] Recovery bootstrap reusing checkpoint plan', {
                    runId,
                    sourceRunId: recoveryContext?.sourceRunId,
                    startPlanIndex,
                    planItems: resumedPlan.items.length
                });
            }

            let executionGraph = ExecutionGraph.fromPlan(plan);
            if (startPlanIndex > 0) {
                for (let completedIndex = 0; completedIndex < startPlanIndex; completedIndex++) {
                    const completedItem = plan.items[completedIndex];
                    if (!completedItem) {
                        continue;
                    }
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, completedItem.id, 'completed');
                }
            }

            currentState = WorkflowState.transitionTo(currentState, 'thinking', { plan, executionGraph });
            yield { type: 'state_updated', state: currentState };
            await this.durability.checkpoint(runId, currentState, 'plan_ready');
            runLifecycle = this.durability.transition(runId, runLifecycle, 'executing');

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

                const executionOptions = this.runCoordinator.buildExecutionOptions(input.options);

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
                    }
                );

                const kernelResult = yield* stepKernel;
                currentState = kernelResult.state;
                estimatedTokensUsed = kernelResult.estimatedTokensUsed;
                const { result } = kernelResult;

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

            const completionAssessment = this.objectiveCompletionPolicy.assess({
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
        const replanningTrigger = result && !result.success ? this.replanningCoordinator.mapResultCodeToTrigger(result.code) : undefined;
        const replanningAssessment = this.replanningPolicy.assess({
            runId: ctx.runId,
            replanCount: ctx.replanCount,
            ...(replanningTrigger ? { trigger: replanningTrigger } : {})
        });

        if (replanningAssessment.shouldReplan) {
            this.logger.warn('[ReplanningPolicyService] Replanning approved (active mode)', {
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

        this.logger.warn('[RunUseCase] Step failed verification', {
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
            yield { type: 'completed', success: false, summary: "Cancelled by user." };
            await this.lifecycleManager.finalizeRun(runId, false, "Cancelled by user.");
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

    private async *performRecoveryReplay(
        runId: RunId,
        recoveryContext: RecoveryBootstrapContext,
        automation: IStructuredAutomation,
        controller: ExecutionController,
        currentState: WorkflowState,
        targetStepNumber: number
    ): AsyncGenerator<RunOutput, { state: WorkflowState; cancelled: boolean }, unknown> {
        yield this.buildRecoveryReplayEvent({
            sourceRunId: recoveryContext.sourceRunId,
            targetStepNumber,
            replayedCount: 0,
            status: 'started'
        });

        const replayOutcome = await replayRecoveryActionsForRun(this.recoveryDeps, {
            runId,
            sourceRunId: recoveryContext.sourceRunId,
            sourceBranchId: recoveryContext.branchId,
            automation,
            controller,
            state: currentState,
            targetStepNumber
        });

        if (replayOutcome.type === 'ok' || replayOutcome.type === 'cancelled') {
            yield this.buildRecoveryReplayEvent({
                sourceRunId: recoveryContext.sourceRunId,
                targetStepNumber,
                replayedCount: replayOutcome.replayedCount,
                status: replayOutcome.type === 'ok' ? 'completed' : 'cancelled'
            });
        } else {
            yield this.buildRecoveryReplayEvent({
                sourceRunId: recoveryContext.sourceRunId,
                targetStepNumber,
                replayedCount: replayOutcome.replayedCount,
                status: replayOutcome.type,
                reason: replayOutcome.reason
            });
        }

        if (replayOutcome.type === 'blocked') {
            throw new WorkflowError(`Recovery replay blocked: ${replayOutcome.reason}`);
        }

        if (replayOutcome.type === 'failed') {
            throw new WorkflowError(`Recovery replay failed: ${replayOutcome.reason}`);
        }

        const updatedState = replayOutcome.state;
        yield { type: 'state_updated', state: updatedState };

        this.logger.info('[RunUseCase] Recovery replay completed', {
            runId,
            sourceRunId: recoveryContext.sourceRunId,
            replayedCount: replayOutcome.replayedCount
        });

        return { state: updatedState, cancelled: replayOutcome.type === 'cancelled' };
    }

private buildRecoveryReplayEvent(params: {
        sourceRunId: string;
        targetStepNumber: number;
        replayedCount: number;
        status: 'started' | 'completed' | 'cancelled' | 'failed' | 'blocked';
        reason?: string;
    }): RunOutput {
        return {
            type: 'recovery_replay',
            telemetry: {
                sourceRunId: params.sourceRunId,
                targetStepNumber: params.targetStepNumber,
                replayedCount: params.replayedCount,
                status: params.status,
                ...(params.reason ? { reason: params.reason } : {})
            }
        };
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
