
import { injectable, inject } from 'tsyringe';
import { IBrowserAutomation } from '../../domain/ports';
import { ExecutionGraph, UrlFactory, WorkflowState } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';
import { TestRunState } from '../../domain/enums/TestRunState';
import { WorkflowPlanner } from '../services/planning/WorkflowPlanner';
import { StepExecutor, type StepExecutionResult } from '../services/execution/StepExecutor';
import type { StepEvaluationTelemetry } from '../services/execution/StepExecutor';
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
import { EvidenceBlackboardService } from '../services/execution/EvidenceBlackboardService';
import { BranchRollbackService } from '../services/execution/BranchRollbackService';
import { SelectiveReplannerService } from '../services/execution/SelectiveReplannerService';
import { RunLifecycleEngineService } from '../services/execution/RunLifecycleEngineService';
import type { IRunLifecycleEngine } from '../services/execution/IRunLifecycleEngine';
import { PlanningCoordinator, type SkillRoutingContext } from '../services/execution/coordinators/PlanningCoordinator';
import { RunBootstrapCoordinator } from '../services/execution/coordinators/RunBootstrapCoordinator';
import { StepExecutionCoordinator, type StepExecutionOptions } from '../services/execution/coordinators/StepExecutionCoordinator';
import { ReplanningCoordinator } from '../services/execution/coordinators/ReplanningCoordinator';
import { TerminalizationCoordinator } from '../services/execution/coordinators/TerminalizationCoordinator';
import { GraphSchedulerService } from '../services/execution/GraphSchedulerService';
import {
    resolveRecoveryContext as resolveRecoveryContextForRun,
    replayRecoveryActions as replayRecoveryActionsForRun,
    type RecoveryBootstrapContext,
    type RecoveryReplayOutcome,
    type RunRecoveryDependencies
} from '../services/execution/RunRecoveryOrchestration';
import { SkillRegistryService } from '../services/skills/SkillRegistryService';
import { SkillGovernanceService } from '../services/skills/SkillGovernanceService';
import { SkillExecutorService } from '../services/skills/SkillExecutorService';
import { PluginRegistryService } from '../services/plugins/PluginRegistryService';
import { PluginGatewayService } from '../services/plugins/PluginGatewayService';
import { RuntimeReadinessPolicyService } from '../services/hardening/RuntimeReadinessPolicyService';
import type { Plan, PlanItem, PlanItemStatus } from '@domain/entities/Plan';
import { TestStep } from '../../domain/ports';
import { v4 as uuidv4 } from 'uuid';
import type { ILogger } from '../../domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';
import type { ToolContext } from '../../domain/tools/Tool';
import type { RunLifecycleState } from '@domain/value-objects/RunLifecycle';
import type { SkillDefinition } from '@domain/skills/SkillContract';
import type { PlatformSession } from '../services/platform/PlatformSession';

export interface RunExecutionContext {
    readonly session?: PlatformSession;
    readonly shouldNavigate?: boolean;
    readonly disposeSessionOnComplete?: boolean;
}


@injectable()
export class RunTestUseCase {
    private readonly graphScheduler = new GraphSchedulerService();

    constructor(
        @inject(TestRunLifecycleManager) private lifecycleManager: TestRunLifecycleManager,
        @inject(WorkflowPlanner) private planner: WorkflowPlanner,
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
        @inject(SkillRegistryService) private readonly skillRegistry: SkillRegistryService,
        @inject(SkillGovernanceService) private readonly skillGovernance: SkillGovernanceService,
        @inject(PluginRegistryService) private readonly pluginRegistry: PluginRegistryService,
        @inject(PluginGatewayService) private readonly pluginGateway: PluginGatewayService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject('ILogger') private logger: ILogger,
        @inject(SkillExecutorService) private readonly skillExecutor: SkillExecutorService = new SkillExecutorService(),
        @inject(PlanningCoordinator) private readonly planningCoordinator: PlanningCoordinator = new PlanningCoordinator(),
        @inject(RunBootstrapCoordinator) private readonly bootstrapCoordinator: RunBootstrapCoordinator = new RunBootstrapCoordinator(),
        @inject(StepExecutionCoordinator) private readonly stepExecutionCoordinator: StepExecutionCoordinator = new StepExecutionCoordinator(),
        @inject(ReplanningCoordinator) private readonly replanningCoordinator: ReplanningCoordinator = new ReplanningCoordinator(),
        @inject(TerminalizationCoordinator) private readonly terminalizationCoordinator: TerminalizationCoordinator = new TerminalizationCoordinator(),
        @inject(SelectiveReplannerService) private readonly selectiveReplanner: SelectiveReplannerService = new SelectiveReplannerService(),
        @inject('IRunLifecycleEngine') private readonly runLifecycleEngine: IRunLifecycleEngine = new RunLifecycleEngineService(),
        @inject(BranchRollbackService) private readonly branchRollback: BranchRollbackService = new BranchRollbackService(),
        @inject(ObjectiveCompletionPolicyService) private readonly objectiveCompletionPolicy: ObjectiveCompletionPolicyService = new ObjectiveCompletionPolicyService(),
        @inject(EvidenceBlackboardService) private readonly evidenceBlackboard: EvidenceBlackboardService = new EvidenceBlackboardService()
    ) { }

    private getRecoveryDependencies(): RunRecoveryDependencies {
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
        const retryCount = 0;
        const recoveryContext = await this.resolveRecoveryContext(input);
        const skillRoutingContext = this.resolveSkillRoutingContext(input, testRunId);
        this.evaluatePluginPreflight(input, testRunId);

        let browser: IBrowserAutomation | undefined;
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
            
            if (!browser) {
                throw new WorkflowError('Failed to initialize browser automation interface');
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

            yield { type: 'thinking' }; // Loading state

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

                const replayOutcome = await this.replayRecoveryActions({
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
            let plan: Plan;
            let runtimeSkillPlan: Plan | undefined;

            if (!resumedPlan && skillRoutingContext) {
                yield {
                    type: 'skill_invocation',
                    telemetry: {
                        runId: testRunId,
                        skillId: skillRoutingContext.skill.id,
                        source: skillRoutingContext.source,
                        status: 'started',
                        summary: `Skill runtime started for ${skillRoutingContext.skill.id}`
                    }
                };

                try {
                    runtimeSkillPlan = this.skillExecutor.buildRuntimePlan(skillRoutingContext.skill, input.prompt);
                    yield {
                        type: 'skill_invocation',
                        telemetry: {
                            runId: testRunId,
                            skillId: skillRoutingContext.skill.id,
                            source: skillRoutingContext.source,
                            status: 'completed',
                            summary: `Skill runtime compiled with ${runtimeSkillPlan.items.length} bounded steps`,
                            injectedPlanItems: runtimeSkillPlan.items.length
                        }
                    };
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    this.logger.warn('[RunTestUseCase] Skill runtime compilation failed', {
                        testRunId,
                        skillId: skillRoutingContext.skill.id,
                        reason
                    });

                    yield {
                        type: 'skill_invocation',
                        telemetry: {
                            runId: testRunId,
                            skillId: skillRoutingContext.skill.id,
                            source: skillRoutingContext.source,
                            status: 'failed',
                            summary: `Skill runtime failed: ${reason}`
                        }
                    };

                    throw new WorkflowError(`Skill runtime compilation failed: ${reason}`);
                }
            }

            if (resumedPlan) {
                plan = resumedPlan;
                this.logger.info('[RunTestUseCase] Recovery bootstrap reusing checkpoint plan', {
                    testRunId,
                    sourceRunId: recoveryContext?.sourceRunId,
                    startPlanIndex,
                    planItems: resumedPlan.items.length
                });
            } else {
                const planningPrompt = this.planningCoordinator.buildPlanningPrompt(input.prompt, skillRoutingContext);
                const planResult = await this.planner.plan(planningPrompt);

                if (planResult.isErr()) {
                    throw new WorkflowError(`Planning failed: ${planResult.error.message}`);
                }

                plan = planResult.value;
                estimatedTokensUsed += Math.ceil(planningPrompt.length / 4);

                if (runtimeSkillPlan) {
                    plan = this.skillExecutor.prependRuntimePlan(plan, runtimeSkillPlan);
                }
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
                const executionGoal = input.prompt;

                if (controller.state === TestRunState.PAUSED) {
                    runLifecycle = this.durability.transition(testRunId, runLifecycle, 'paused');
                    await this.durability.checkpoint(testRunId, currentState, 'pause_requested');
                    await controller.waitForResume();
                    runLifecycle = this.durability.transition(testRunId, runLifecycle, 'executing');
                    await this.durability.checkpoint(testRunId, currentState, 'resume_requested');
                }
                if (controller.state === TestRunState.CANCELLED) {
                    break;
                }

                const preStepBudgetAssessment = this.budgetPolicy.evaluate(testRunId, budgetLimits, {
                    actionsTaken: currentState.stepNumber,
                    elapsedMs: Date.now() - runStartMs,
                    estimatedTokensUsed,
                    retryCount
                });

                if (preStepBudgetAssessment.status === 'exceeded') {
                    throw new WorkflowError(
                        this.budgetPolicy.formatExceededMessage(
                            budgetLimits,
                            {
                                actionsTaken: currentState.stepNumber,
                                elapsedMs: Date.now() - runStartMs,
                                estimatedTokensUsed,
                                retryCount
                            },
                            preStepBudgetAssessment
                        )
                    );
                }

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
                        retryCount,
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

                    const proactiveReplan = this.evaluatePostStepReplan(currentState);
                    if (proactiveReplan.shouldReplan) {
                        const replanningLimits = this.replanningPolicy.resolveLimits();
                        yield {
                            type: 'replanning',
                            telemetry: {
                                runId: testRunId,
                                status: 'executed',
                                reason: proactiveReplan.reason,
                                mode: replanningLimits.mode,
                                replanCount,
                                maxReplansPerRun: replanningLimits.maxReplansPerRun
                            }
                        };

                        try {
                            plan = await this.executeScopedReplan({
                                originalPrompt: input.prompt,
                                currentPlan: plan,
                                failedStepDescription: executionGoal,
                                failureReason: proactiveReplan.reason,
                                currentState,
                                failedNodeId: item.id
                            });
                        } catch (error) {
                            const plannerError = error instanceof Error ? error.message : String(error);
                            throw new WorkflowError(`Proactive replanning failed: ${plannerError}`);
                        }

                        executionGraph = ExecutionGraph.fromPlan(plan);
                        currentState = {
                            ...currentState,
                            status: 'thinking',
                            plan,
                            executionGraph
                        };
                        yield { type: 'state_updated', state: currentState };
                        await this.durability.checkpoint(testRunId, currentState, 'plan_ready');
                        replanCount += 1;
                    }
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

                    if (replanningAssessment.shouldReplan) {
                        try {
                            plan = await this.executeScopedReplan({
                                originalPrompt: input.prompt,
                                currentPlan: plan,
                                failedStepDescription: executionGoal,
                                failureReason: errorMsg,
                                currentState,
                                failedNodeId: item.id
                            });

                            executionGraph = ExecutionGraph.fromPlan(plan);
                            const clearedState = this.runLifecycleEngine.clearActiveItem(currentState);
                            const { error, ...stateWithoutError } = clearedState;
                            void error;
                            currentState = {
                                ...stateWithoutError,
                                status: 'thinking',
                                executionGraph,
                                plan
                            };
                            yield { type: 'state_updated', state: currentState };
                            await this.durability.checkpoint(testRunId, currentState, 'plan_ready');

                            replanCount += 1;
                            consecutiveStepFailures = 0;
                            hasUnresolvedVerificationFailure = false;
                            finalSummary = undefined;
                            continue;
                        } catch (error) {
                            const plannerError = error instanceof Error ? error.message : String(error);
                            this.logger.warn('[RunTestUseCase] Replanning attempt failed; continuing failure path', {
                                runId: testRunId,
                                reason: plannerError
                            });
                        }
                    }

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
            this.evidenceBlackboard.clearRun(testRunId);
        }
    }

    private async *executePlanItemKernel(
        testRunId: string,
        executionGoal: string,
        plan: Plan,
        browser: IBrowserAutomation,
        url: string,
        currentState: WorkflowState,
        executionOptions: StepExecutionOptions,
        runtime: {
            budgetLimits: RunBudgetLimits;
            runStartMs: number;
            estimatedTokensUsed: number;
            retryCount: number;
            controller: ExecutionController;
            stepToolContext?: ToolContext;
        }
    ): AsyncGenerator<RunTestOutput, {
        state: WorkflowState;
        result: StepExecutionResult;
        estimatedTokensUsed: number;
    }, unknown> {
        let pendingEvaluation: StepEvaluationTelemetry | undefined;
        let estimatedTokensUsed = runtime.estimatedTokensUsed;

        const stepGen = this.executor.executeStep(
            testRunId,
            executionGoal,
            browser,
            url,
            currentState.stepNumber,
            executionOptions,
            {
                ...(runtime.stepToolContext ? { toolContext: runtime.stepToolContext } : {}),
                overrideProvider: runtime.controller,
                plan,
                onEvaluation: (evaluationTelemetry: StepEvaluationTelemetry) => {
                    pendingEvaluation = evaluationTelemetry;
                }
            }
        );

        try {
            const iterator = stepGen[Symbol.asyncIterator]();
            let next = await iterator.next();

            while (!next.done) {
                if (pendingEvaluation) {
                    const evaluation = pendingEvaluation.evaluation;
                    yield {
                        type: 'evaluating',
                        actionType: pendingEvaluation.attemptedAction.type,
                        decision: evaluation.decision,
                        summary: evaluation.summary,
                        confidence: evaluation.confidence,
                        evidence: evaluation.evidence,
                        ...(evaluation.advice ? { advice: evaluation.advice } : {}),
                        executionOutcome: pendingEvaluation.executionOutcome,
                        ...(pendingEvaluation.executionError ? { executionError: pendingEvaluation.executionError } : {}),
                        ...(pendingEvaluation.executionObservation ? { executionObservation: pendingEvaluation.executionObservation } : {})
                    };

                    currentState = this.runLifecycleEngine.applyEvaluation(currentState, evaluation);
                    pendingEvaluation = undefined;
                    yield { type: 'state_updated', state: currentState };
                    await this.durability.checkpoint(testRunId, currentState, 'action_applied');
                }

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
                    yield { type: 'state_updated', state: currentState };
                    await this.durability.checkpoint(testRunId, currentState, 'action_applied');

                    const budgetAssessment = this.budgetPolicy.evaluate(testRunId, runtime.budgetLimits, {
                        actionsTaken: currentState.stepNumber,
                        elapsedMs: Date.now() - runtime.runStartMs,
                        estimatedTokensUsed,
                        retryCount: runtime.retryCount
                    });

                    if (budgetAssessment.status === 'exceeded') {
                        throw new WorkflowError(
                            this.budgetPolicy.formatExceededMessage(
                                runtime.budgetLimits,
                                {
                                    actionsTaken: currentState.stepNumber,
                                    elapsedMs: Date.now() - runtime.runStartMs,
                                    estimatedTokensUsed,
                                    retryCount: runtime.retryCount
                                },
                                budgetAssessment
                            )
                        );
                    }

                    yield { type: 'acting', action };
                }

                next = await iterator.next();
            }

            if (pendingEvaluation) {
                const evaluation = pendingEvaluation.evaluation;
                yield {
                    type: 'evaluating',
                    actionType: pendingEvaluation.attemptedAction.type,
                    decision: evaluation.decision,
                    summary: evaluation.summary,
                    confidence: evaluation.confidence,
                    evidence: evaluation.evidence,
                    ...(evaluation.advice ? { advice: evaluation.advice } : {}),
                    executionOutcome: pendingEvaluation.executionOutcome,
                    ...(pendingEvaluation.executionError ? { executionError: pendingEvaluation.executionError } : {}),
                    ...(pendingEvaluation.executionObservation ? { executionObservation: pendingEvaluation.executionObservation } : {})
                };

                currentState = this.runLifecycleEngine.applyEvaluation(currentState, evaluation);
                pendingEvaluation = undefined;
                yield { type: 'state_updated', state: currentState };
                await this.durability.checkpoint(testRunId, currentState, 'action_applied');
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

    private async resolveRecoveryContext(input: RunTestInput): Promise<RecoveryBootstrapContext | null> {
        return resolveRecoveryContextForRun(this.getRecoveryDependencies(), input);
    }

    private async executeScopedReplan(input: {
        originalPrompt: string;
        currentPlan: Plan;
        failedStepDescription: string;
        failureReason: string;
        currentState: WorkflowState;
        failedNodeId: string;
    }): Promise<Plan> {
        return this.selectiveReplanner.replan({
            originalPrompt: input.originalPrompt,
            currentPlan: input.currentPlan,
            failedStepDescription: input.failedStepDescription,
            failureReason: input.failureReason,
            planner: this.planner,
            coordinator: this.replanningCoordinator,
            ...(input.currentState.lastEvaluation ? { lastEvaluation: input.currentState.lastEvaluation } : {}),
            ...(input.currentState.evaluatorAdvice ? { evaluatorAdvice: input.currentState.evaluatorAdvice } : {}),
            ...(input.currentState.evaluatorAdviceDelta ? { evaluatorAdviceDelta: input.currentState.evaluatorAdviceDelta } : {}),
            ...(input.currentState.executionGraph ? { executionGraph: input.currentState.executionGraph } : {}),
            failedNodeId: input.failedNodeId
        });
    }

    private evaluatePostStepReplan(state: WorkflowState): { shouldReplan: boolean; reason: string } {
        const evaluation = state.lastEvaluation;

        if (!evaluation) {
            return { shouldReplan: false, reason: 'No evaluator signal available' };
        }

        if (evaluation.decision !== 'sub_task_success') {
            return { shouldReplan: false, reason: 'Evaluator decision is not success; standard loop handles progression' };
        }

        if (evaluation.confidence < 0.9) {
            return {
                shouldReplan: true,
                reason: `Proactive rolling-horizon replanning: success confidence ${evaluation.confidence.toFixed(2)} below threshold 0.90`
            };
        }

        return { shouldReplan: false, reason: 'Success confidence is above proactive replanning threshold' };
    }

    private async replayRecoveryActions(params: {
        testRunId: string;
        sourceRunId: string;
        sourceBranchId: string;
        browser: IBrowserAutomation;
        controller: ExecutionController;
        state: WorkflowState;
        targetStepNumber: number;
    }): Promise<RecoveryReplayOutcome> {
        return replayRecoveryActionsForRun(this.getRecoveryDependencies(), params);
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


    private resolveSkillRoutingContext(input: RunTestInput, runId: string): SkillRoutingContext | undefined {
        const skillId = input.options?.preferredSkillId?.trim();

        try {
            const allowedTrustLevels = input.options?.allowedSkillTrustLevels ?? ['verified'];

            if (skillId) {
                const preferredSkill = this.skillRegistry.get(skillId);
                if (!preferredSkill) {
                    this.logger.warn('[RunTestUseCase] Skill routing skipped: preferred skill not found', { runId, skillId });
                    return undefined;
                }

                const allowed = this.skillGovernance.isAllowed(preferredSkill, allowedTrustLevels);
                this.logger.info('[RunTestUseCase] Skill routing evaluated preferred skill', {
                    runId,
                    skillId,
                    skillTrust: preferredSkill.trust,
                    allowed
                });

                if (!allowed) {
                    return undefined;
                }

                return {
                    skill: preferredSkill,
                    source: 'preferred',
                    graphSteps: this.buildSkillExecutionGraph(preferredSkill)
                };
            }

            const autoSkill = this.selectAutoSkill(input.prompt, allowedTrustLevels);
            if (!autoSkill) {
                return undefined;
            }

            this.logger.info('[RunTestUseCase] Skill routing auto-selected skill', {
                runId,
                skillId: autoSkill.id,
                skillTrust: autoSkill.trust
            });

            return {
                skill: autoSkill,
                source: 'auto',
                graphSteps: this.buildSkillExecutionGraph(autoSkill)
            };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn('[RunTestUseCase] Skill routing failed non-fatally', { runId, ...(skillId ? { skillId } : {}), reason });
            return undefined;
        }
    }

    private selectAutoSkill(prompt: string, allowedTrustLevels: readonly SkillDefinition['trust'][]): SkillDefinition | undefined {
        const scoredSkills = this.skillRegistry
            .list()
            .filter(skill => this.skillGovernance.isAllowed(skill, allowedTrustLevels))
            .map(skill => ({
                skill,
                score: this.scoreSkillMatch(prompt, skill)
            }))
            .filter(entry => entry.score > 0)
            .sort((left, right) => right.score - left.score);

        return scoredSkills[0]?.skill;
    }

    private scoreSkillMatch(prompt: string, skill: SkillDefinition): number {
        const normalizedPrompt = prompt.toLowerCase();
        const tokens = [
            ...skill.id.toLowerCase().split(/[^a-z0-9]+/g),
            ...skill.description.toLowerCase().split(/[^a-z0-9]+/g),
            ...skill.preconditions.flatMap((item) => item.toLowerCase().split(/[^a-z0-9]+/g)),
            ...skill.postconditions.flatMap((item) => item.toLowerCase().split(/[^a-z0-9]+/g))
        ].filter(token => token.length >= 3);

        if (tokens.length === 0) {
            return 0;
        }

        let score = 0;
        for (const token of new Set(tokens)) {
            if (normalizedPrompt.includes(token)) {
                score += 1;
            }
        }

        return score;
    }

    private buildSkillExecutionGraph(skill: SkillDefinition): readonly string[] {
        const steps: string[] = [];

        skill.preconditions.forEach((precondition) => {
            steps.push(`Validate precondition: ${precondition}`);
        });

        steps.push(`Execute skill objective: ${skill.description}`);

        skill.postconditions.forEach((postcondition) => {
            steps.push(`Verify postcondition: ${postcondition}`);
        });

        return steps.slice(0, 6);
    }


    private evaluatePluginPreflight(input: RunTestInput, runId: string): void {
        const preflight = input.options?.pluginPreflight;
        if (!preflight) {
            return;
        }

        try {
            const manifest = this.pluginRegistry.get(preflight.pluginId);
            if (!manifest) {
                this.logger.warn('[RunTestUseCase] Plugin preflight skipped: plugin not found', {
                    runId,
                    pluginId: preflight.pluginId
                });
                return;
            }

            const result = this.pluginGateway.authorize(manifest, {
                runId,
                pluginId: preflight.pluginId,
                capability: preflight.capability,
                payload: {}
            });

            this.logger.info('[RunTestUseCase] Plugin preflight evaluated', {
                runId,
                pluginId: preflight.pluginId,
                capability: preflight.capability,
                success: result.success,
                message: result.message
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn('[RunTestUseCase] Plugin preflight failed non-fatally', {
                runId,
                pluginId: preflight.pluginId,
                reason
            });
        }
    }

}
