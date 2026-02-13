
import { injectable, inject } from 'tsyringe';
import { IBrowserAutomation } from '../../domain/ports';
import { UrlFactory, WorkflowState } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';
import { TestRunState } from '../../domain/enums/TestRunState';
import { ActionType } from '../../domain/enums/ActionType';
import { WorkflowPlanner } from '../services/planning/WorkflowPlanner';
import { StepExecutor, type StepExecutionResult } from '../services/execution/StepExecutor';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '../services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '../services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '../services/execution/CheckpointCompactionService';
import { RecoveryReadModelService } from '../services/execution/RecoveryReadModelService';
import { ManualRecoveryBootstrapService } from '../services/execution/ManualRecoveryBootstrapService';
import { RunRecoveryPolicyService, type RecoveryMode } from '../services/execution/RunRecoveryPolicyService';
import { RecoveryReplayGuardService } from '../services/execution/RecoveryReplayGuardService';
import { ReplanningPolicyService } from '../services/execution/ReplanningPolicyService';
import { SkillRegistryService } from '../services/skills/SkillRegistryService';
import { SkillGovernanceService } from '../services/skills/SkillGovernanceService';
import { PluginRegistryService } from '../services/plugins/PluginRegistryService';
import { PluginGatewayService } from '../services/plugins/PluginGatewayService';
import { RuntimeReadinessPolicyService } from '../services/hardening/RuntimeReadinessPolicyService';
import type { Plan, PlanItem, PlanItemStatus } from '@domain/entities/Plan';
import { TestStep } from '../../domain/ports';
import type { AgentAction } from '../../domain/value-objects';
import { v4 as uuidv4 } from 'uuid';
import type { ILogger } from '../../domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';
import type { ToolContext } from '../../domain/tools/Tool';
import type { RunLifecycleState } from '@domain/value-objects/RunLifecycle';

interface RecoveryBootstrapContext {
    readonly sourceRunId: string;
    readonly state: WorkflowState;
    readonly plan?: Plan;
    readonly startPlanIndex: number;
}

type RecoveryReplayOutcome =
    | { readonly type: 'ok'; readonly state: WorkflowState; readonly replayedCount: number }
    | { readonly type: 'cancelled'; readonly state: WorkflowState; readonly replayedCount: number }
    | { readonly type: 'blocked'; readonly reason: string; readonly replayedCount: number }
    | { readonly type: 'failed'; readonly reason: string; readonly replayedCount: number };

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
        @inject(ReplanningPolicyService) private readonly replanningPolicy: ReplanningPolicyService,
        @inject(SkillRegistryService) private readonly skillRegistry: SkillRegistryService,
        @inject(SkillGovernanceService) private readonly skillGovernance: SkillGovernanceService,
        @inject(PluginRegistryService) private readonly pluginRegistry: PluginRegistryService,
        @inject(PluginGatewayService) private readonly pluginGateway: PluginGatewayService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject('ILogger') private logger: ILogger
    ) { }

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
        let hasVerificationFailure = false;
        let replanCount = 0;
        let terminalError: Error | null = null;

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
            currentState = { ...currentState, plan };
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

                // Update Item Status to Running
                const runningItem: PlanItem = { ...item, status: 'active' as PlanItemStatus };
                const updatedItems = [...plan.items];
                updatedItems[i] = runningItem;
                currentState = { ...currentState, activeItemId: runningItem.id, plan: { ...plan, items: updatedItems } };
                yield { type: 'state_updated', state: currentState };

                const executionOptions = {
                    vision: input.options?.vision ?? true,
                    debugScreenshots: input.options?.debugScreenshots ?? false,
                    maxActions: input.options?.maxSteps ?? 20,
                    temporalObservation: input.options?.temporalObservation ?? false,
                    temporalBurstFrames: input.options?.temporalBurstFrames ?? 3
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

                            await this.persistence.saveTestStep(step);

                            // Update state
                            currentState = {
                                ...currentState,
                                stepNumber: currentState.stepNumber + 1,
                                history: [...currentState.history, action]
                            };
                            estimatedTokensUsed += Math.ceil(JSON.stringify(action).length / 4);
                            yield { type: 'state_updated', state: currentState };
                            await this.durability.checkpoint(testRunId, currentState, 'action_applied');
                            this.budgetPolicy.logIfExceeded(testRunId, budgetLimits, {
                                actionsTaken: currentState.stepNumber,
                                elapsedMs: Date.now() - runStartMs,
                                estimatedTokensUsed,
                                retryCount
                            });

                            yield { type: 'acting', action: next.value.action };
                        }
                        next = await iterator.next();
                    }
                    result = next.value;
                } catch (e) {
                    const iteratorError = e instanceof Error ? e : new Error(String(e));
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
                    currentState = { ...this.clearActiveItem(currentState), plan: { ...plan, items: successItems } };
                    yield { type: 'state_updated', state: currentState };
                } else {
                    // Step Failed
                    const errorMsg = result ? `${result.code}: ${result.reason}` : 'unknown_error: Unknown error';
                    const replanningTrigger = result ? this.mapResultCodeToReplanningTrigger(result.code) : undefined;

                    this.replanningPolicy.logIfSuggested({
                        runId: testRunId,
                        replanCount,
                        ...(replanningTrigger ? { trigger: replanningTrigger } : {})
                    });

                    const completedWithFailureItem: PlanItem = { ...item, status: 'completed' as PlanItemStatus };
                    const newItems = [...updatedItems];
                    newItems[i] = completedWithFailureItem;
                    currentState = { ...this.clearActiveItem(currentState), plan: { ...plan, items: newItems } };
                    yield { type: 'state_updated', state: currentState };

                    replanCount += 1;

                    console.warn(`[RunTestUseCase] Step failed verification: ${errorMsg}`);
                    finalSummary = `Verification failed: ${errorMsg}`;
                    hasVerificationFailure = true;
                    // We DO NOT throw here anymore. We continue execution or finish.
                    // Since this is likely the last step (verification), we just proceed.
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
                runLifecycle = this.durability.transition(testRunId, runLifecycle, 'failed');
                await this.durability.checkpoint(testRunId, currentState, 'terminal_failure');
                yield { type: 'error', error: terminalError };
            } else if (controller.state === TestRunState.CANCELLED) {
                runLifecycle = this.durability.transition(testRunId, runLifecycle, 'cancelled');
                await this.durability.checkpoint(testRunId, currentState, 'terminal_cancelled');
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else if (completed) {
                runLifecycle = this.durability.transition(testRunId, runLifecycle, hasVerificationFailure ? 'failed' : 'completed');
                await this.durability.checkpoint(testRunId, currentState, hasVerificationFailure ? 'terminal_failure' : 'terminal_success');
                const isGlobalSuccess = !hasVerificationFailure;
                yield { type: 'completed', success: isGlobalSuccess, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, isGlobalSuccess, finalSummary);
            }

            await this.logCheckpointCompactionSummary(testRunId);
        }
    }

    private async resolveRecoveryContext(input: RunTestInput): Promise<RecoveryBootstrapContext | null> {
        const recoveryFeatureEnabled = process.env['DOMIA_ENABLE_RECOVERY_SCAFFOLD'] === 'true';
        const recoveryRunId = input.options?.recoveryRunId?.trim();

        if (!recoveryFeatureEnabled || !recoveryRunId) {
            return null;
        }

        const checkpoints = await this.durability.getCheckpointRecords(recoveryRunId);
        const compactedView = this.checkpointCompaction.compact(recoveryRunId, checkpoints);
        const readModel = this.recoveryReadModel.build(recoveryRunId, compactedView.compacted);
        const recoveryMode: RecoveryMode = input.options?.recoveryMode ?? 'manual-only';
        const decision = this.recoveryPolicy.decide(readModel, recoveryMode);

        this.logger.info('[RunTestUseCase] Recovery scaffold decision evaluated', {
            recoveryRunId,
            recoveryMode,
            shouldRecover: decision.shouldRecover,
            reason: decision.reason,
            checkpointCount: checkpoints.length,
            compactedCheckpointCount: compactedView.compacted.length
        });

        if (!decision.shouldRecover || recoveryMode !== 'manual-only') {
            return null;
        }

        const latest = compactedView.latest;
        if (!latest) {
            this.logger.warn('[RunTestUseCase] Recovery bootstrap skipped: latest checkpoint unavailable', {
                recoveryRunId,
                recoveryMode
            });
            return null;
        }

        const bootstrap = this.recoveryBootstrap.bootstrapFromCheckpoint(latest.state);

        this.logger.info('[RunTestUseCase] Recovery bootstrap applied from latest checkpoint', {
            recoveryRunId,
            stepNumber: bootstrap.state.stepNumber,
            status: bootstrap.state.status,
            startPlanIndex: bootstrap.startPlanIndex,
            hasPlan: Boolean(bootstrap.state.plan)
        });

        return {
            sourceRunId: recoveryRunId,
            state: bootstrap.state,
            ...(bootstrap.state.plan ? { plan: bootstrap.state.plan } : {}),
            startPlanIndex: bootstrap.startPlanIndex
        };
    }

    private clearActiveItem(state: WorkflowState): WorkflowState {
        const { activeItemId: _removed, ...withoutActiveItem } = state;
        return withoutActiveItem;
    }

    private async replayRecoveryActions(params: {
        testRunId: string;
        sourceRunId: string;
        browser: IBrowserAutomation;
        controller: ExecutionController;
        state: WorkflowState;
        targetStepNumber: number;
    }): Promise<RecoveryReplayOutcome> {
        const { testRunId, sourceRunId, browser, controller, state, targetStepNumber } = params;

        if (targetStepNumber <= 0) {
            return { type: 'ok', state, replayedCount: 0 };
        }

        const stepsResult = await this.persistence.getTestSteps(sourceRunId);
        if (stepsResult.isErr()) {
            return { type: 'failed', reason: stepsResult.error.message, replayedCount: 0 };
        }

        const sourceSteps = stepsResult.value;
        if (sourceSteps.length < targetStepNumber) {
            return {
                type: 'failed',
                reason: `Checkpoint step target (${targetStepNumber}) exceeds available source steps (${sourceSteps.length})`,
                replayedCount: 0
            };
        }

        let replayedCount = 0;
        let nextState = state;

        for (const sourceStep of sourceSteps.slice(0, targetStepNumber)) {
            if (controller.state === TestRunState.CANCELLED) {
                return { type: 'cancelled', state: nextState, replayedCount };
            }

            const action = sourceStep.actionPayload;
            const decision = this.recoveryReplayGuard.decide(action);

            if (decision.decision === 'block') {
                return {
                    type: 'blocked',
                    reason: `${decision.reason} at source step ${sourceStep.stepNumber}`,
                    replayedCount
                };
            }

            if (decision.decision === 'skip') {
                this.logger.debug('[RunTestUseCase] Recovery replay skipped action', {
                    testRunId,
                    sourceRunId,
                    sourceStepNumber: sourceStep.stepNumber,
                    actionType: action.type,
                    reason: decision.reason
                });
                continue;
            }

            try {
                await this.executeReplayAction(browser, action);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                return {
                    type: 'failed',
                    reason: `Execution failed at source step ${sourceStep.stepNumber}: ${reason}`,
                    replayedCount
                };
            }

            const replayStep: TestStep = {
                id: uuidv4(),
                testRunId,
                stepNumber: nextState.stepNumber + 1,
                actionType: action.type,
                actionPayload: action,
                timestamp: new Date().toISOString()
            };

            await this.persistence.saveTestStep(replayStep);

            nextState = {
                ...nextState,
                stepNumber: nextState.stepNumber + 1,
                history: [...nextState.history, action]
            };
            replayedCount += 1;

            await this.durability.checkpoint(testRunId, nextState, 'action_applied');
        }

        return { type: 'ok', state: nextState, replayedCount };
    }

    private async executeReplayAction(browser: IBrowserAutomation, action: AgentAction): Promise<void> {
        switch (action.type) {
            case ActionType.WAIT: {
                const result = await browser.wait(action.durationMs);
                if (result.isErr()) {
                    throw new WorkflowError(`wait failed: ${result.error.message}`);
                }
                return;
            }

            case ActionType.SCROLL: {
                const result = await browser.scroll(action.direction);
                if (result.isErr()) {
                    throw new WorkflowError(`scroll failed: ${result.error.message}`);
                }
                return;
            }

            case ActionType.EXTRACT: {
                const result = await browser.extractText(action.elementId);
                if (result.isErr()) {
                    throw new WorkflowError(`extract failed: ${result.error.message}`);
                }
                return;
            }

            case ActionType.NAVIGATE: {
                const urlResult = UrlFactory.create(action.url);
                if (urlResult.isErr()) {
                    throw new WorkflowError(`navigate failed: invalid url '${action.url}'`);
                }

                const result = await browser.navigateTo(urlResult.value);
                if (result.isErr()) {
                    throw new WorkflowError(`navigate failed: ${result.error.message}`);
                }
                return;
            }

            case ActionType.PASS:
            case ActionType.FAIL:
                return;

            case ActionType.CLICK:
            case ActionType.TYPE:
            case ActionType.PRESS_KEY:
                throw new WorkflowError(`non-idempotent replay action blocked: ${action.type}`);

            default: {
                const exhaustiveCheck: never = action;
                throw new WorkflowError(`unsupported replay action: ${String(exhaustiveCheck)}`);
            }
        }
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
        if (process.env['DOMIA_ENABLE_SKILL_SCAFFOLD'] !== 'true') {
            return;
        }

        const skillId = input.options?.preferredSkillId?.trim();
        if (!skillId) {
            return;
        }

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
    }

    private evaluatePluginScaffold(input: RunTestInput, runId: string): void {
        if (process.env['DOMIA_ENABLE_PLUGIN_SCAFFOLD'] !== 'true') {
            return;
        }

        const preflight = input.options?.pluginPreflight;
        if (!preflight) {
            return;
        }

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
