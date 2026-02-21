
import { injectable, inject } from 'tsyringe';
import { IBrowserAutomation } from '../../domain/ports';
import { ExecutionGraph, UrlFactory, WorkflowState } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';
import { TestRunState } from '../../domain/enums/TestRunState';
import { StepExecutor, type StepExecutionResult } from '../services/execution/StepExecutor';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '../services/execution/RunDurabilityService';
import { RunBudgetPolicyService, type RunBudgetLimits } from '../services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '../services/execution/CheckpointCompactionService';
import { RecoveryReadModelService } from '../services/execution/RecoveryReadModelService';
import { ManualRecoveryBootstrapService } from '../services/execution/ManualRecoveryBootstrapService';
import { RunRecoveryPolicyService } from '../services/execution/RunRecoveryPolicyService';
import { RecoveryReplayGuardService } from '../services/execution/RecoveryReplayGuardService';
import { RecoveryReplayIdempotencyService } from '../services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '../services/execution/ReplanningPolicyService';
import { ObjectiveCompletionPolicyService } from '../services/execution/ObjectiveCompletionPolicyService';

import { BranchRollbackService } from '../services/execution/BranchRollbackService';
import { RunLifecycleEngineService } from '../services/execution/RunLifecycleEngineService';
import type { IRunLifecycleEngine } from '../services/execution/IRunLifecycleEngine';
import { PlanningCoordinator } from '../services/execution/coordinators/PlanningCoordinator';
import { RunBootstrapCoordinator } from '../services/execution/coordinators/RunBootstrapCoordinator';
import { StepExecutionCoordinator, type StepExecutionOptions } from '../services/execution/coordinators/StepExecutionCoordinator';
import { ReplanningCoordinator } from '../services/execution/coordinators/ReplanningCoordinator';
import { TerminalizationCoordinator } from '../services/execution/coordinators/TerminalizationCoordinator';
import { GraphSchedulerService } from '../services/execution/GraphSchedulerService';
import {
    resolveRecoveryContext as resolveRecoveryContextForRun,
    replayRecoveryActions as replayRecoveryActionsForRun,
    type RunRecoveryDependencies
} from '../services/execution/RunRecoveryOrchestration';
import { SkillRegistryService } from '../services/skills/SkillRegistryService';
import { SkillGovernanceService } from '../services/skills/SkillGovernanceService';
import { PluginRegistryService } from '../services/plugins/PluginRegistryService';
import { PluginGatewayService } from '../services/plugins/PluginGatewayService';
import { SkillRoutingCoordinator } from '../services/execution/coordinators/SkillRoutingCoordinator';
import { PluginPreflightCoordinator } from '../services/execution/coordinators/PluginPreflightCoordinator';
import { RuntimeReadinessPolicyService } from '../services/hardening/RuntimeReadinessPolicyService';
import type { Plan, PlanItem, PlanItemStatus } from '@domain/entities/Plan';
import { TestStep } from '../../domain/ports';
import { v4 as uuidv4 } from 'uuid';
import type { ILogger } from '../../domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';
import type { ToolContext } from '../../domain/tools/Tool';
import type { RunLifecycleState } from '@domain/value-objects/RunLifecycle';
import type { PlatformSession } from '../services/platform/PlatformSession';

export interface RunExecutionContext {
    readonly session?: PlatformSession;
    readonly shouldNavigate?: boolean;
    readonly disposeSessionOnComplete?: boolean;
}


@injectable()
export class RunTestUseCase {
    private readonly graphScheduler = new GraphSchedulerService();
    private readonly skillRoutingCoordinator: SkillRoutingCoordinator;
    private readonly pluginPreflightCoordinator: PluginPreflightCoordinator;

    constructor(
        @inject(TestRunLifecycleManager) private lifecycleManager: TestRunLifecycleManager,
        @inject(StepExecutor) private executor: StepExecutor,
        @inject('IPersistenceAdapter') private persistence: import('../../domain/ports').IPersistenceAdapter,
        @inject('ITraceService') private trace: import('../../domain/ports/ITraceService').ITraceService,
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory,
        @inject('IRunExecutionLaneService') private readonly laneService: RunExecutionLaneService,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(CheckpointCompactionService) private readonly checkpointCompaction: CheckpointCompactionService,
        @inject(RecoveryReadModelService) private readonly recoveryReadModel: RecoveryReadModelService,
        @inject(ManualRecoveryBootstrapService) private readonly recoveryBootstrap: ManualRecoveryBootstrapService,
        @inject(RunRecoveryPolicyService) private readonly recoveryPolicy: RunRecoveryPolicyService,
        @inject(RecoveryReplayGuardService) private readonly recoveryReplayGuard: RecoveryReplayGuardService,
        @inject(RecoveryReplayIdempotencyService) private readonly recoveryReplayIdempotency: RecoveryReplayIdempotencyService,
        @inject(ReplanningPolicyService) private readonly replanningPolicy: ReplanningPolicyService,
        @inject(SkillRegistryService) skillRegistry: SkillRegistryService,
        @inject(SkillGovernanceService) skillGovernance: SkillGovernanceService,
        @inject(PluginRegistryService) pluginRegistry: PluginRegistryService,
        @inject(PluginGatewayService) pluginGateway: PluginGatewayService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject('ILogger') private logger: ILogger,
        @inject(PlanningCoordinator) private readonly planningCoordinator: PlanningCoordinator = new PlanningCoordinator(),
        @inject(RunBootstrapCoordinator) private readonly bootstrapCoordinator: RunBootstrapCoordinator = new RunBootstrapCoordinator(),
        @inject(StepExecutionCoordinator) private readonly stepExecutionCoordinator: StepExecutionCoordinator = new StepExecutionCoordinator(),
        @inject(ReplanningCoordinator) private readonly replanningCoordinator: ReplanningCoordinator = new ReplanningCoordinator(),
        @inject(TerminalizationCoordinator) private readonly terminalizationCoordinator: TerminalizationCoordinator = new TerminalizationCoordinator(),
        @inject('IRunLifecycleEngine') private readonly runLifecycleEngine: IRunLifecycleEngine = new RunLifecycleEngineService(),
        @inject(BranchRollbackService) private readonly branchRollback: BranchRollbackService = new BranchRollbackService(),
        @inject(ObjectiveCompletionPolicyService) private readonly objectiveCompletionPolicy: ObjectiveCompletionPolicyService = new ObjectiveCompletionPolicyService()
    ) {
        this.skillRoutingCoordinator = new SkillRoutingCoordinator(skillRegistry, skillGovernance, logger);
        this.pluginPreflightCoordinator = new PluginPreflightCoordinator(pluginRegistry, pluginGateway, logger);
    }

    private get recoveryDeps(): RunRecoveryDependencies {
        return {
            persistence: this.persistence,
            durability: this.durability,
            checkpointCompaction: this.checkpointCompaction,
            branchRollback: this.branchRollback,
            recoveryReadModel: this.recoveryReadModel,
            recoveryBootstrap: this.recoveryBootstrap,
            recoveryPolicy: this.recoveryPolicy,
            recoveryReplayGuard: this.recoveryReplayGuard,
            recoveryReplayIdempotency: this.recoveryReplayIdempotency,
            logger: this.logger
        };
    }

    async *execute(
        input: RunTestInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext
    ): AsyncGenerator<RunTestOutput, void, unknown> {
        const url = this.bootstrapCoordinator.resolveExecutionUrl(input, runContext);

        const readinessDecision = this.readinessPolicy.assess(input, url);
        if (readinessDecision.blocked) {
            yield { type: 'error', error: new WorkflowError(readinessDecision.message ?? 'Readiness gate blocked the run.') };
            return;
        }

        const laneKey = this.bootstrapCoordinator.resolveLaneKey(input);
        const releaseLane = await this.laneService.acquire(laneKey);

        const initResult = await this.lifecycleManager.initializeTestRun(url, input.prompt);
        if (initResult.isErr()) {
            releaseLane();
            yield { type: 'error', error: initResult.error };
            return;
        }
        const testRunId = initResult.value;
        let runLifecycle: RunLifecycleState = 'initialized';
        const budgetLimits = this.budgetPolicy.resolveLimits(input.options);
        const runStartMs = Date.now();
        let estimatedTokensUsed = 0;
        const recoveryContext = await resolveRecoveryContextForRun(this.recoveryDeps, input);
        const skillRoutingContext = this.skillRoutingCoordinator.resolve(input, testRunId);
        this.pluginPreflightCoordinator.evaluate(input, testRunId);

        let browser: IBrowserAutomation;
        let disposeSession: (() => Promise<void>) | undefined;
        let shouldNavigate = true;
        let ownsSession = false;
        let stepToolContext: ToolContext | undefined;
        
        try {
            const session = runContext?.session ?? await this.sessionFactory.createSession(input);
            browser = session.browser;
            disposeSession = session.dispose;
            shouldNavigate = runContext?.shouldNavigate ?? session.shouldNavigate;
            ownsSession = runContext?.session
                ? (runContext.disposeSessionOnComplete ?? false)
                : true;

            if (session.driver) {
                stepToolContext = {
                    driver: session.driver,
                    platform: session.driver.getCapabilities().platform,
                    logger: this.logger
                };
            }
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

        await this.durability.checkpoint(testRunId, currentState, 'run_initialized');
        yield { type: 'started', testRunId };
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
                const navResult = await browser.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await browser.waitForDOMStable();
            }

            if (recoveryContext) {
                yield this.buildRecoveryReplayEvent({
                    sourceRunId: recoveryContext.sourceRunId,
                    targetStepNumber: recoveryTargetStepNumber,
                    replayedCount: 0,
                    status: 'started'
                });

                const replayOutcome = await replayRecoveryActionsForRun(this.recoveryDeps, {
                    testRunId,
                    sourceRunId: recoveryContext.sourceRunId,
                    sourceBranchId: recoveryContext.branchId,
                    browser,
                    controller,
                    state: currentState,
                    targetStepNumber: recoveryTargetStepNumber
                });

                if (replayOutcome.type === 'ok' || replayOutcome.type === 'cancelled') {
                    yield this.buildRecoveryReplayEvent({
                        sourceRunId: recoveryContext.sourceRunId,
                        targetStepNumber: recoveryTargetStepNumber,
                        replayedCount: replayOutcome.replayedCount,
                        status: replayOutcome.type === 'ok' ? 'completed' : 'cancelled'
                    });
                } else {
                    yield this.buildRecoveryReplayEvent({
                        sourceRunId: recoveryContext.sourceRunId,
                        targetStepNumber: recoveryTargetStepNumber,
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

                currentState = replayOutcome.state;
                yield { type: 'state_updated', state: currentState };

                this.logger.info('[RunTestUseCase] Recovery replay completed', {
                    testRunId,
                    sourceRunId: recoveryContext.sourceRunId,
                    replayedCount: replayOutcome.replayedCount
                });

                if (replayOutcome.type === 'cancelled') {
                    return;
                }
            }

            currentState = {
                ...currentState,
                status: 'planning'
            };
            yield { type: 'state_updated', state: currentState };
            yield { type: 'thinking' };
            runLifecycle = this.durability.transition(testRunId, runLifecycle, 'planning');
            const plan: Plan = resumedPlan
                ?? this.planningCoordinator.buildSingleStepPlan(
                    this.planningCoordinator.buildPlanningPrompt(input.prompt, skillRoutingContext)
                );

            if (resumedPlan) {
                this.logger.info('[RunTestUseCase] Recovery bootstrap reusing checkpoint plan', {
                    testRunId,
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
                    executionGraph = this.graphScheduler.updateNodeState(executionGraph, completedItem.id, 'completed');
                }
            }

            currentState = { ...currentState, plan, executionGraph, status: 'thinking' };
            yield { type: 'state_updated', state: currentState };
            await this.durability.checkpoint(testRunId, currentState, 'plan_ready');
            runLifecycle = this.durability.transition(testRunId, runLifecycle, 'executing');

            while (true) {
                const nextNode = this.graphScheduler.selectNextReadyNode(executionGraph);
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
                    testRunId,
                    runLifecycle,
                    currentState
                });
                runLifecycle = controlFlow.runLifecycle;
                if (controlFlow.cancelled) {
                    break;
                }

                this.throwIfBudgetExceeded(testRunId, budgetLimits, this.buildBudgetSnapshot({
                    actionsTaken: currentState.stepNumber,
                    runStartMs,
                    estimatedTokensUsed
                }));

                const runningItem: PlanItem = { ...item, status: 'active' as PlanItemStatus };
                const updatedItems = [...plan.items];
                updatedItems[i] = runningItem;
                executionGraph = this.graphScheduler.updateNodeState(executionGraph, runningItem.id, 'running');
                currentState = {
                    ...currentState,
                    status: 'observing',
                    activeItemId: runningItem.id,
                    activeNodeId: runningItem.id,
                    executionGraph,
                    plan: { ...plan, items: updatedItems }
                };
                yield { type: 'state_updated', state: currentState };

                const executionOptions = this.stepExecutionCoordinator.buildExecutionOptions(input.options);

                const stepKernel = this.executePlanItemKernel(
                    testRunId,
                    executionGoal,
                    plan,
                    browser,
                    url,
                    currentState,
                    executionOptions,
                    {
                        budgetLimits,
                        runStartMs,
                        estimatedTokensUsed,
                        controller,
                        ...(stepToolContext ? { stepToolContext } : {})
                    }
                );

                const kernelIterator = stepKernel[Symbol.asyncIterator]();
                let kernelNext = await kernelIterator.next();
                while (!kernelNext.done) {
                    if (kernelNext.value.type === 'state_updated') {
                        currentState = kernelNext.value.state;
                    }

                    yield kernelNext.value;
                    kernelNext = await kernelIterator.next();
                }

                const {
                    state: kernelState,
                    result,
                    estimatedTokensUsed: nextEstimatedTokensUsed
                } = kernelNext.value;

                currentState = kernelState;
                estimatedTokensUsed = nextEstimatedTokensUsed;

                if (result && result.success) {
                    const successItem: PlanItem = { ...item, status: 'completed' as PlanItemStatus };
                    const successItems = [...updatedItems];
                    successItems[i] = successItem;
                    executionGraph = this.graphScheduler.updateNodeState(executionGraph, successItem.id, 'completed');
                    currentState = {
                        ...this.runLifecycleEngine.clearActiveItem(currentState),
                        status: 'idle',
                        executionGraph,
                        plan: { ...plan, items: successItems }
                    };
                    yield { type: 'state_updated', state: currentState };
                    consecutiveStepFailures = 0;
                    hasUnresolvedVerificationFailure = false;
                    finalSummary = undefined;
                } else {
                    const errorMsg = result ? `${result.code}: ${result.reason}` : 'unknown_error: Unknown error';
                    const replanningTrigger = result ? this.replanningCoordinator.mapResultCodeToTrigger(result.code) : undefined;
                    const replanningAssessment = this.replanningPolicy.assess({
                        runId: testRunId,
                        replanCount,
                        ...(replanningTrigger ? { trigger: replanningTrigger } : {})
                    });

                    if (replanningAssessment.shouldReplan) {
                        this.logger.warn('[ReplanningPolicyService] Replanning approved (active mode)', {
                            runId: testRunId,
                            trigger: replanningTrigger,
                            replanCount,
                            reason: replanningAssessment.reason
                        });
                    }

                    const replanningLimits = this.replanningPolicy.resolveLimits();
                    yield {
                        type: 'replanning',
                        telemetry: {
                            runId: testRunId,
                            ...(replanningTrigger ? { trigger: replanningTrigger } : {}),
                            status: replanningAssessment.shouldReplan ? 'executed' : 'suppressed',
                            reason: replanningAssessment.reason,
                            mode: replanningAssessment.mode,
                            replanCount,
                            maxReplansPerRun: replanningLimits.maxReplansPerRun
                        }
                    };

                    const completedWithFailureItem: PlanItem = { ...item, status: 'failed' as PlanItemStatus };
                    const newItems = [...updatedItems];
                    newItems[i] = completedWithFailureItem;
                    executionGraph = this.graphScheduler.updateNodeState(executionGraph, completedWithFailureItem.id, 'failed');
                    currentState = {
                        ...this.runLifecycleEngine.clearActiveItem(currentState),
                        status: 'failed',
                        error: errorMsg,
                        executionGraph,
                        plan: { ...plan, items: newItems }
                    };
                    yield { type: 'state_updated', state: currentState };

                    replanCount += 1;
                    consecutiveStepFailures += 1;

                    this.logger.warn('[RunTestUseCase] Step failed verification', {
                        runId: testRunId,
                        error: errorMsg,
                        planItemId: item.id,
                        planItemDescription: item.description
                    });
                    finalSummary = `Verification failed: ${errorMsg}`;
                    hasUnresolvedVerificationFailure = true;

                    if (consecutiveStepFailures >= maxConsecutiveStepFailures) {
                        this.logger.warn('[RunTestUseCase] Halting run after consecutive failed steps', {
                            runId: testRunId,
                            consecutiveStepFailures,
                            maxConsecutiveStepFailures
                        });
                        finalSummary = `Stopped after ${consecutiveStepFailures} consecutive failed steps: ${errorMsg}`;
                        break;
                    }
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
            await this.lifecycleManager.failTestRun(testRunId, msg);
            terminalError = error instanceof Error ? error : new Error(msg);
        } finally {
            if (disposeSession && ownsSession) {
                await disposeSession().catch(err =>
                    this.logger.warn(`[RunTestUseCase] Error during session cleanup: ${String(err)}`)
                );
            }

            releaseLane();

            await this.trace.endTrace();

            if (terminalError) {
                currentState = this.terminalizationCoordinator.applyTerminalState(currentState, 'failed', terminalError.message);
                runLifecycle = this.durability.transition(testRunId, runLifecycle, 'failed');
                await this.durability.checkpoint(testRunId, currentState, 'terminal_failure');
                yield { type: 'error', error: terminalError };
            } else if (controller.state === TestRunState.CANCELLED) {
                currentState = this.terminalizationCoordinator.applyTerminalState(currentState, 'idle', 'cancelled');
                runLifecycle = this.durability.transition(testRunId, runLifecycle, 'cancelled');
                await this.durability.checkpoint(testRunId, currentState, 'terminal_cancelled');
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else if (completed) {
                currentState = this.terminalizationCoordinator.applyTerminalState(
                    currentState,
                    hasUnresolvedVerificationFailure ? 'failed' : 'completed',
                    hasUnresolvedVerificationFailure ? finalSummary : undefined
                );
                runLifecycle = this.durability.transition(testRunId, runLifecycle, hasUnresolvedVerificationFailure ? 'failed' : 'completed');
                await this.durability.checkpoint(testRunId, currentState, hasUnresolvedVerificationFailure ? 'terminal_failure' : 'terminal_success');
                const isGlobalSuccess = !hasUnresolvedVerificationFailure;
                yield { type: 'completed', success: isGlobalSuccess, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, isGlobalSuccess, finalSummary);
            }

            await this.logCheckpointCompactionSummary(testRunId);

        }
    }

    private async *executePlanItemKernel(
        testRunId: string,
        executionGoal: string,
        _plan: Plan,
        browser: IBrowserAutomation,
        url: string,
        currentState: WorkflowState,
        executionOptions: StepExecutionOptions,
        runtime: {
            budgetLimits: RunBudgetLimits;
            runStartMs: number;
            estimatedTokensUsed: number;
            controller: ExecutionController;
            stepToolContext?: ToolContext;
        }
    ): AsyncGenerator<RunTestOutput, {
        state: WorkflowState;
        result: StepExecutionResult;
        estimatedTokensUsed: number;
    }, unknown> {
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

    private buildBudgetSnapshot(params: {
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

    private throwIfBudgetExceeded(testRunId: string, limits: RunBudgetLimits, snapshot: {
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

    private buildRecoveryReplayEvent(params: {
        sourceRunId: string;
        targetStepNumber: number;
        replayedCount: number;
        status: 'started' | 'completed' | 'cancelled' | 'failed' | 'blocked';
        reason?: string;
    }): RunTestOutput {
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
        testRunId: string;
        runLifecycle: RunLifecycleState;
        currentState: WorkflowState;
    }): Promise<{ runLifecycle: RunLifecycleState; cancelled: boolean }> {
        let runLifecycle = input.runLifecycle;

        if (input.controller.state === TestRunState.PAUSED) {
            runLifecycle = this.durability.transition(input.testRunId, runLifecycle, 'paused');
            await this.durability.checkpoint(input.testRunId, input.currentState, 'pause_requested');
            await input.controller.waitForResume();
            runLifecycle = this.durability.transition(input.testRunId, runLifecycle, 'executing');
            await this.durability.checkpoint(input.testRunId, input.currentState, 'resume_requested');
        }

        return {
            runLifecycle,
            cancelled: input.controller.state === TestRunState.CANCELLED
        };
    }

    private async logCheckpointCompactionSummary(runId: string): Promise<void> {
        const checkpoints = await this.durability.getCheckpointRecords(runId);
        const compactedView = this.checkpointCompaction.compact(runId, checkpoints);

        this.logger.debug('[RunTestUseCase] Checkpoint compaction summary', {
            runId,
            totalCheckpoints: checkpoints.length,
            compactedCheckpoints: compactedView.compacted.length,
            latestReason: compactedView.latest?.reason
        });
    }

}
