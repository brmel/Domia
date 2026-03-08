import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation } from '@domain/ports';
import { UrlFactory, WorkflowState } from '@domain/value-objects';
import type { RunId } from '@domain/value-objects/Brand';
import { ExecutionController } from '../ExecutionController';
import { WorkflowError } from '@domain/errors';
import { RunLifecycleManager } from '../services/RunLifecycleManager';
import { RunInput, RunOutput } from '../dtos';
import { RunState } from '@domain/enums';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '../services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '../services/execution/RunBudgetPolicyService';
import { StepExecutionKernelService } from '../services/execution/StepExecutionKernelService';
import type { StepExecutionResult } from '../services/execution/StepExecutionKernelService';

import { resolveUrlFromConfig, resolveLaneKeyFromConfig, buildExecutionOptions } from '../services/platform/platformUrlUtils';
import { RuntimeReadinessPolicyService } from '../services/hardening/RuntimeReadinessPolicyService';
import { Plan, PlanItem } from '@domain/entities/Plan';
import type { ILogger } from '@domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';
import { nanoid } from 'nanoid';

import type { PlatformSession } from '../services/platform/PlatformSession';

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
        const budgetLimits = this.budgetPolicy.resolveLimits(input.options);
        const runStartMs = Date.now();
        let estimatedTokensUsed = 0;

        let automation: IStructuredAutomation;
        let disposeSession: (() => Promise<void>) | undefined;
        let shouldNavigate = true;
        let ownsSession = false;
        let sessionExtras: Readonly<Record<string, unknown>> | undefined;
        let browserWsEndpoint: string | null = null;

        try {
            const session = runContext?.session ?? await this.sessionFactory.createSession(input);
            automation = session.automation;
            disposeSession = session.dispose;
            shouldNavigate = runContext?.shouldNavigate ?? session.shouldNavigate;
            sessionExtras = session.extras;
            browserWsEndpoint = session.driver?.getBrowserWsEndpoint?.() ?? null;
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
        let stepResult: StepExecutionResult | undefined;
        let terminalError: Error | null = null;

        try {
            const urlResult = UrlFactory.create(url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);

            if (shouldNavigate) {
                const navResult = await automation.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await automation.waitForReady();
            }

            if (browserWsEndpoint) {
                yield { type: 'browser_ready', wsEndpoint: browserWsEndpoint };
            }

            currentState = WorkflowState.transitionTo(currentState, 'thinking');
            yield { type: 'state_updated', state: currentState };

            const now = new Date();
            const plan: Plan = {
                id: nanoid(),
                goal: input.prompt,
                status: 'executing',
                createdAt: now,
                updatedAt: now,
                items: [{ id: nanoid(), description: input.prompt, status: 'pending', type: 'app' }]
            };
            const planItem = plan.items[0]!;

            currentState = WorkflowState.transitionTo(currentState, 'thinking', { plan });
            yield { type: 'state_updated', state: currentState };
            await this.durability.checkpoint(runId, currentState, 'plan_ready');

            // Pause/cancel check
            if (controller.state === RunState.PAUSED) {
                await this.durability.checkpoint(runId, currentState, 'pause_requested');
                await controller.waitForResume();
                await this.durability.checkpoint(runId, currentState, 'resume_requested');
            }
            if (controller.state === RunState.CANCELLED) {
                completed = true;
                stepResult = { success: false, terminal: 'error', code: 'user_cancelled', reason: 'Cancelled by user.' };
            } else {
                this.kernel.throwIfBudgetExceeded(runId, budgetLimits, this.kernel.buildBudgetSnapshot({
                    actionsTaken: currentState.stepNumber,
                    runStartMs,
                    estimatedTokensUsed
                }));

                const runningItem = PlanItem.activate(planItem);
                currentState = WorkflowState.transitionTo(currentState, 'observing', {
                    activeItemId: runningItem.id,
                    plan: { ...plan, items: [runningItem] }
                });
                yield { type: 'state_updated', state: currentState };

                const executionOptions = {
                    ...buildExecutionOptions(input.options, input.platformConfig.platform),
                    ...(sessionExtras ? { extras: sessionExtras } : {}),
                };

                const stepKernel = this.kernel.execute(
                    runId,
                    planItem.description,
                    automation,
                    url,
                    currentState,
                    executionOptions,
                    { budgetLimits, runStartMs, estimatedTokensUsed },
                    controller
                );

                const kernelResult = yield* stepKernel;
                currentState = kernelResult.state;
                estimatedTokensUsed = kernelResult.estimatedTokensUsed;
                stepResult = kernelResult.result;

                if (stepResult?.success) {
                    const completedItem = PlanItem.complete(runningItem);
                    currentState = WorkflowState.transitionTo(
                        WorkflowState.clearActiveItem(currentState),
                        'idle',
                        { plan: { ...plan, items: [completedItem] } }
                    );
                    yield { type: 'state_updated', state: currentState };
                } else {
                    const failedItem = PlanItem.fail(runningItem);
                    const errorMsg = stepResult ? `${stepResult.code}: ${stepResult.reason}` : 'unknown_error';
                    currentState = WorkflowState.transitionTo(
                        WorkflowState.clearActiveItem(currentState),
                        'failed',
                        { error: errorMsg, plan: { ...plan, items: [failedItem] } }
                    );
                    yield { type: 'state_updated', state: currentState };
                }

                completed = true;
            }
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
                stepResult, currentState
            });
        }
    }

    private async *finalizeExecution(ctx: {
        readonly runId: RunId;
        readonly controller: ExecutionController;
        readonly completed: boolean;
        readonly terminalError: Error | null;
        readonly stepResult: StepExecutionResult | undefined;
        readonly currentState: WorkflowState;
    }): AsyncGenerator<RunOutput, void, unknown> {
        const { runId, controller, terminalError, stepResult } = ctx;
        let { currentState } = ctx;

        if (terminalError) {
            currentState = WorkflowState.applyTerminal(currentState, 'failed', terminalError.message);
            await this.durability.checkpoint(runId, currentState, 'terminal_failure');
            yield { type: 'error', error: terminalError };
        } else if (controller.state === RunState.CANCELLED) {
            currentState = WorkflowState.applyTerminal(currentState, 'idle', 'cancelled');
            await this.durability.checkpoint(runId, currentState, 'terminal_cancelled');
            yield { type: 'cancelled', summary: 'Cancelled by user.' };
            await this.lifecycleManager.finalizeRun(runId, false, 'Cancelled by user.');
        } else if (ctx.completed) {
            const success = !!stepResult?.success;
            const summary = success ? 'Completed successfully.' : (stepResult ? `${stepResult.code}: ${stepResult.reason}` : 'Unknown failure');
            currentState = WorkflowState.applyTerminal(currentState, success ? 'completed' : 'failed', success ? undefined : summary);
            await this.durability.checkpoint(runId, currentState, success ? 'terminal_success' : 'terminal_failure');
            yield { type: 'completed', success, summary };
            await this.lifecycleManager.finalizeRun(runId, success, summary);
        }
    }
}
