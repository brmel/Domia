
import { injectable, inject } from 'tsyringe';
import { IBrowserAutomation } from '../../domain/ports';
import { UrlFactory, WorkflowState } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';
import { TestRunState } from '../../domain/enums/TestRunState';
import { WorkflowPlanner } from '../services/planning/WorkflowPlanner';
import { StepExecutor, type StepExecutionResult } from '../services/execution/StepExecutor';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '../services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '../services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '../services/execution/CheckpointCompactionService';
import { RecoveryReadModelService } from '../services/execution/RecoveryReadModelService';
import { ManualRecoveryBootstrapService } from '../services/execution/ManualRecoveryBootstrapService';
import { RunRecoveryPolicyService } from '../services/execution/RunRecoveryPolicyService';
import { RecoveryReplayGuardService } from '../services/execution/RecoveryReplayGuardService';
import { RecoveryReplayIdempotencyService } from '../services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '../services/execution/ReplanningPolicyService';
import {
    resolveRecoveryContext as resolveRecoveryContextForRun,
    replayRecoveryActions as replayRecoveryActionsForRun,
    type RecoveryBootstrapContext,
    type RecoveryReplayOutcome,
    type RunRecoveryDependencies
} from '../services/execution/RunRecoveryOrchestration';
import { SkillRegistryService } from '../services/skills/SkillRegistryService';
import { SkillGovernanceService } from '../services/skills/SkillGovernanceService';
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

type StepFailureCode = Extract<StepExecutionResult, { success: false }>['code'];


@injectable()
export class RunTestUseCase {
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
        @inject('ILogger') private logger: ILogger
    ) { }

    private getRecoveryDependencies(): RunRecoveryDependencies {
        return {
            persistence: this.persistence,
            durability: this.durability,
            checkpointCompaction: this.checkpointCompaction,
            recoveryReadModel: this.recoveryReadModel,
            recoveryBootstrap: this.recoveryBootstrap,
            recoveryPolicy: this.recoveryPolicy,
            recoveryReplayGuard: this.recoveryReplayGuard,
            recoveryReplayIdempotency: this.recoveryReplayIdempotency,
            logger: this.logger
        };
    }

    async *execute(input: RunTestInput, controller: ExecutionController): AsyncGenerator<RunTestOutput, void, unknown> {
        const url = this.resolveRunUrl(input.platformConfig);

        const readinessDecision = this.readinessPolicy.assess(input, url);
        if (readinessDecision.blocked) {
            yield { type: 'error', error: new WorkflowError(readinessDecision.message ?? 'Readiness gate blocked the run.') };
            return;
        }

        const laneKey = this.resolveLaneKey(input);
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
        this.evaluateSkillScaffold(input, testRunId);
        this.evaluatePluginScaffold(input, testRunId);

        let browser: IBrowserAutomation | undefined;
        let disposeSession: (() => Promise<void>) | undefined;
        let shouldNavigate = true;
        let stepToolContext: ToolContext | undefined;
        
        try {
            const session = await this.sessionFactory.createSession(input);
            browser = session.browser;
            disposeSession = session.dispose;
            shouldNavigate = session.shouldNavigate;

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
            if (disposeSession) {
                await disposeSession();
            }
            releaseLane();
            return;
        }

        // Initialize State
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
        let terminalPassSummary: string | undefined;
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
                yield {
                    type: 'recovery_replay',
                    telemetry: {
                        sourceRunId: recoveryContext.sourceRunId,
                        targetStepNumber: recoveryTargetStepNumber,
                        replayedCount: 0,
                        status: 'started'
                    }
                };

                const replayOutcome = await this.replayRecoveryActions({
                    testRunId,
                    sourceRunId: recoveryContext.sourceRunId,
                    browser,
                    controller,
                    state: currentState,
                    targetStepNumber: recoveryTargetStepNumber
                });

                if (replayOutcome.type === 'ok' || replayOutcome.type === 'cancelled') {
                    yield {
                        type: 'recovery_replay',
                        telemetry: {
                            sourceRunId: recoveryContext.sourceRunId,
                            targetStepNumber: recoveryTargetStepNumber,
                            replayedCount: replayOutcome.replayedCount,
                            status: replayOutcome.type === 'ok' ? 'completed' : 'cancelled'
                        }
                    };
                } else {
                    yield {
                        type: 'recovery_replay',
                        telemetry: {
                            sourceRunId: recoveryContext.sourceRunId,
                            targetStepNumber: recoveryTargetStepNumber,
                            replayedCount: replayOutcome.replayedCount,
                            status: replayOutcome.type,
                            reason: replayOutcome.reason
                        }
                    };
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

            // 1. Planning Phase
            currentState = this.withWorkflowStatus(currentState, 'planning');
            yield { type: 'state_updated', state: currentState };
            yield { type: 'thinking' };
            runLifecycle = this.durability.transition(testRunId, runLifecycle, 'planning');
            let plan: Plan;

            if (resumedPlan) {
                plan = resumedPlan;
                this.logger.info('[RunTestUseCase] Recovery bootstrap reusing checkpoint plan', {
                    testRunId,
                    sourceRunId: recoveryContext?.sourceRunId,
                    startPlanIndex,
                    planItems: resumedPlan.items.length
                });
            } else {
                const planResult = await this.planner.plan(input.prompt);

                if (planResult.isErr()) {
                    throw new WorkflowError(`Planning failed: ${planResult.error.message}`);
                }

                plan = planResult.value;
            }

            estimatedTokensUsed += Math.ceil(input.prompt.length / 4);
            currentState = { ...currentState, plan, status: 'thinking' };
            yield { type: 'state_updated', state: currentState };
            await this.durability.checkpoint(testRunId, currentState, 'plan_ready');
            runLifecycle = this.durability.transition(testRunId, runLifecycle, 'executing');

            // 2. Execution Phase
            for (let i = startPlanIndex; i < plan.items.length; i++) {
                const item = plan.items[i];
                if (!item) continue;

                // Check Pause/Cancel
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

                // Update Item Status to Running
                const runningItem: PlanItem = { ...item, status: 'active' as PlanItemStatus };
                const updatedItems = [...plan.items];
                updatedItems[i] = runningItem;
                currentState = {
                    ...currentState,
                    status: 'observing',
                    activeItemId: runningItem.id,
                    plan: { ...plan, items: updatedItems }
                };
                yield { type: 'state_updated', state: currentState };

                const executionOptions = {
                    vision: input.options?.vision ?? true,
                    debugScreenshots: input.options?.debugScreenshots ?? false,
                    maxActions: input.options?.maxSteps ?? 20,
                    temporalObservation: input.options?.temporalObservation ?? false,
                    temporalMode: input.options?.temporalMode ?? 'adaptive',
                    ...(input.options?.temporalBurstFrames !== undefined ? { temporalBurstFrames: input.options.temporalBurstFrames } : {}),
                    ...(input.options?.temporalBaselineIntervalMs !== undefined ? { temporalBaselineIntervalMs: input.options.temporalBaselineIntervalMs } : {}),
                    ...(input.options?.temporalBurstIntervalMs !== undefined ? { temporalBurstIntervalMs: input.options.temporalBurstIntervalMs } : {}),
                    ...(input.options?.temporalMaxFramesPerWindow !== undefined ? { temporalMaxFramesPerWindow: input.options.temporalMaxFramesPerWindow } : {}),
                    ...(input.options?.temporalPromptTokenBudget !== undefined ? { temporalPromptTokenBudget: input.options.temporalPromptTokenBudget } : {}),
                    ...(input.options?.temporalRedactSensitive !== undefined ? { temporalRedactSensitive: input.options.temporalRedactSensitive } : {}),
                    ...(input.options?.temporalPersistWindow !== undefined ? { temporalPersistWindow: input.options.temporalPersistWindow } : {})
                };

                const stepGen = this.executor.executeStep(
                    testRunId,
                    item.description,
                    browser,
                    url,
                    currentState.stepNumber,
                    executionOptions,
                    { ...(stepToolContext ? { toolContext: stepToolContext } : {}) }
                );
                let result: StepExecutionResult | undefined;
                let observedTerminalPass = false;

                try {
                    const iterator = stepGen[Symbol.asyncIterator]();
                    let next = await iterator.next();
                    while (!next.done) {
                        if (next.value.type === 'action') {
                            const action = next.value.action;
                            const assets = next.value.assets; // These are paths from StepExecutor

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

                            // Update state
                            currentState = {
                                ...currentState,
                                status: 'acting',
                                stepNumber: currentState.stepNumber + 1,
                                history: [...currentState.history, action]
                            };
                            estimatedTokensUsed += Math.ceil(JSON.stringify(action).length / 4);
                            yield { type: 'state_updated', state: currentState };
                            await this.durability.checkpoint(testRunId, currentState, 'action_applied');

                            if (action.type === 'pass') {
                                observedTerminalPass = true;
                                terminalPassSummary = 'summary' in action && typeof action.summary === 'string'
                                    ? action.summary
                                    : 'Test completed successfully.';
                            }

                            const budgetAssessment = this.budgetPolicy.evaluate(testRunId, budgetLimits, {
                                actionsTaken: currentState.stepNumber,
                                elapsedMs: Date.now() - runStartMs,
                                estimatedTokensUsed,
                                retryCount
                            });

                            if (budgetAssessment.status === 'exceeded') {
                                throw new WorkflowError(
                                    this.budgetPolicy.formatExceededMessage(
                                        budgetLimits,
                                        {
                                            actionsTaken: currentState.stepNumber,
                                            elapsedMs: Date.now() - runStartMs,
                                            estimatedTokensUsed,
                                            retryCount
                                        },
                                        budgetAssessment
                                    )
                                );
                            }

                            yield { type: 'acting', action: next.value.action };
                        }
                        next = await iterator.next();
                    }
                    result = next.value;
                    currentState = this.withWorkflowStatus(currentState, 'validating');
                    yield { type: 'state_updated', state: currentState };
                } catch (e) {
                    const iteratorError = e instanceof Error ? e : new Error(String(e));
                    if (iteratorError instanceof WorkflowError && iteratorError.message.startsWith('Run budget exceeded')) {
                        throw iteratorError;
                    }
                    result = {
                        success: false,
                        terminal: 'error',
                        code: 'action_execution_error',
                        reason: `Step iterator failed: ${iteratorError.message}`
                    };
                }

                if (result && result.success) {
                    // Mark Success
                    const successItem: PlanItem = { ...item, status: 'completed' as PlanItemStatus };
                    const successItems = [...updatedItems];
                    successItems[i] = successItem;
                    currentState = {
                        ...this.clearActiveItem(currentState),
                        status: 'idle',
                        plan: { ...plan, items: successItems }
                    };
                    yield { type: 'state_updated', state: currentState };
                    consecutiveStepFailures = 0;
                    hasUnresolvedVerificationFailure = false;
                    finalSummary = undefined;

                    if (observedTerminalPass) {
                        finalSummary = terminalPassSummary ?? 'Test completed successfully.';
                        break;
                    }
                } else {
                    // Step Failed
                    const errorMsg = result ? `${result.code}: ${result.reason}` : 'unknown_error: Unknown error';
                    const replanningTrigger = result ? this.mapResultCodeToReplanningTrigger(result.code) : undefined;
                    const replanningAssessment = this.replanningPolicy.assess({
                        runId: testRunId,
                        replanCount,
                        ...(replanningTrigger ? { trigger: replanningTrigger } : {})
                    });

                    if (replanningAssessment.suggested) {
                        this.logger.warn('[ReplanningPolicyService] Replanning suggested (observe-only scaffold)', {
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
                            status: replanningAssessment.suggested ? 'suggested' : 'suppressed',
                            reason: replanningAssessment.reason,
                            mode: replanningAssessment.mode,
                            replanCount,
                            maxReplansPerRun: replanningLimits.maxReplansPerRun
                        }
                    };

                    const completedWithFailureItem: PlanItem = { ...item, status: 'completed' as PlanItemStatus };
                    const newItems = [...updatedItems];
                    newItems[i] = completedWithFailureItem;
                    currentState = {
                        ...this.clearActiveItem(currentState),
                        status: 'failed',
                        error: errorMsg,
                        plan: { ...plan, items: newItems }
                    };
                    yield { type: 'state_updated', state: currentState };

                    replanCount += 1;
                    consecutiveStepFailures += 1;

                    console.warn(`[RunTestUseCase] Step failed verification: ${errorMsg}`);
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

            completed = true;
            if (!finalSummary) finalSummary = "Test completed successfully.";

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            await this.lifecycleManager.failTestRun(testRunId, msg);
            terminalError = error instanceof Error ? error : new Error(msg);
        } finally {
            if (disposeSession) {
                await disposeSession().catch(err =>
                    this.logger.warn(`[RunTestUseCase] Error during session cleanup: ${String(err)}`)
                );
            }

            releaseLane();

            // Flush and finalize traces
            await this.trace.endTrace();

            // Final status update
            // Emit exactly one terminal event.
            if (terminalError) {
                currentState = this.withWorkflowStatus(currentState, 'failed', terminalError.message);
                runLifecycle = this.durability.transition(testRunId, runLifecycle, 'failed');
                await this.durability.checkpoint(testRunId, currentState, 'terminal_failure');
                yield { type: 'error', error: terminalError };
            } else if (controller.state === TestRunState.CANCELLED) {
                currentState = this.withWorkflowStatus(currentState, 'idle', 'cancelled');
                runLifecycle = this.durability.transition(testRunId, runLifecycle, 'cancelled');
                await this.durability.checkpoint(testRunId, currentState, 'terminal_cancelled');
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else if (completed) {
                currentState = this.withWorkflowStatus(currentState, hasUnresolvedVerificationFailure ? 'failed' : 'completed', hasUnresolvedVerificationFailure ? finalSummary : undefined);
                runLifecycle = this.durability.transition(testRunId, runLifecycle, hasUnresolvedVerificationFailure ? 'failed' : 'completed');
                await this.durability.checkpoint(testRunId, currentState, hasUnresolvedVerificationFailure ? 'terminal_failure' : 'terminal_success');
                const isGlobalSuccess = !hasUnresolvedVerificationFailure;
                yield { type: 'completed', success: isGlobalSuccess, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, isGlobalSuccess, finalSummary);
            }

            await this.logCheckpointCompactionSummary(testRunId);
        }
    }

    private async resolveRecoveryContext(input: RunTestInput): Promise<RecoveryBootstrapContext | null> {
        return resolveRecoveryContextForRun(this.getRecoveryDependencies(), input);
    }

    private clearActiveItem(state: WorkflowState): WorkflowState {
        const { activeItemId: _removed, ...withoutActiveItem } = state;
        return withoutActiveItem;
    }

    private withWorkflowStatus(
        state: WorkflowState,
        status: WorkflowState['status'],
        error?: string
    ): WorkflowState {
        return {
            ...state,
            status,
            ...(error ? { error } : {})
        };
    }

    private async replayRecoveryActions(params: {
        testRunId: string;
        sourceRunId: string;
        browser: IBrowserAutomation;
        controller: ExecutionController;
        state: WorkflowState;
        targetStepNumber: number;
    }): Promise<RecoveryReplayOutcome> {
        return replayRecoveryActionsForRun(this.getRecoveryDependencies(), params);
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

    private mapResultCodeToReplanningTrigger(
        code: StepFailureCode
    ): import('../services/execution/ReplanningPolicyService').ReplanningTrigger | undefined {
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
            default: {
                const exhaustiveCheck: never = code;
                return exhaustiveCheck;
            }
        }
    }

    private evaluateSkillScaffold(input: RunTestInput, runId: string): void {
        const skillId = input.options?.preferredSkillId?.trim();
        if (!skillId) {
            return;
        }

        try {
            const skill = this.skillRegistry.get(skillId);
            if (!skill) {
                this.logger.warn('[RunTestUseCase] Skill preflight skipped: skill not found', { runId, skillId });
                return;
            }

            const allowedTrustLevels = input.options?.allowedSkillTrustLevels ?? ['verified'];
            const allowed = this.skillGovernance.isAllowed(skill, allowedTrustLevels);

            this.logger.info('[RunTestUseCase] Skill preflight evaluated', {
                runId,
                skillId,
                skillTrust: skill.trust,
                allowed
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn('[RunTestUseCase] Skill preflight failed non-fatally', { runId, skillId, reason });
        }
    }

    private evaluatePluginScaffold(input: RunTestInput, runId: string): void {
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

            const result = this.pluginGateway.invoke(manifest, {
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

    private resolveRunUrl(platformConfig: RunTestInput['platformConfig']): string {
        if (platformConfig.platform === 'web') {
            return platformConfig.url;
        }

        if (platformConfig.connection.type === 'cdp') {
            return platformConfig.connection.cdpUrl;
        }

        return 'electron://app';
    }

    private resolveLaneKey(input: RunTestInput): string {
        const platformConfig = input.platformConfig;

        const platform = platformConfig.platform;

        if (platform === 'web') {
            return `platform:web:${platformConfig.url}`;
        }

        if (platform === 'electron') {
            if (platformConfig.connection.type === 'cdp') {
                return `platform:electron:cdp:${platformConfig.connection.cdpUrl}`;
            }

            return `platform:electron:executable:${platformConfig.connection.executablePath}`;
        }

        const exhaustiveCheck: never = platform;
        return `unsupported:${String(exhaustiveCheck)}`;
    }
}
