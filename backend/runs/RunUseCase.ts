import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation } from '@domain/ports';
import type { AgentRuntimeExtras, AgentOutcome } from '@domain/ports/agent/IAgentRuntime';
import { UrlFactory, WorkflowState } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ExecutionController } from '@backend/ExecutionController';
import { WorkflowError } from '@domain/errors';
import { RunLifecycleManager } from './RunLifecycleManager';
import { RunInput, RunOutput } from '@backend/dto';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@backend/platform/platformUrlUtils';
import { buildRunExecutionOptions } from './runExecutionOptions';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';
import type { RunExecutionContext, PreparedRunSession } from './engine/RunSessionService';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';
import { RunPlanCoordinator } from './RunPlanCoordinator';
import { RunControlGateService } from './RunControlGateService';
import { RunStepEngine } from './engine/RunStepEngine';
import { ObservationProfile, DEFAULT_OBSERVATION_PROFILE, type RunId } from '@domain/value-objects';
import type { ILogger } from '@domain/ports';

@injectable()
export class RunUseCase {
    constructor(
        @inject(RunStepEngine) private readonly engine: RunStepEngine,
        @inject(RunLifecycleManager) private readonly lifecycleManager: RunLifecycleManager,
        @inject('ITraceService') private readonly trace: import('@domain/ports/reporting/ITraceService').ITraceService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject(RunPlanCoordinator) private readonly planCoordinator: RunPlanCoordinator,
        @inject(RunControlGateService) private readonly controlGate: RunControlGateService,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async *execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext,
    ): AsyncGenerator<RunOutput, void, unknown> {
        const url = runContext?.session?.executionUrl ?? resolveUrlFromConfig(input.platformConfig);

        const readinessReport = this.readinessPolicy.assess(input, url);
        if (readinessReport.report && !readinessReport.report.passed) {
            this.logger.warn(`[RunUseCase] readiness advisory: ${readinessReport.message ?? readinessReport.report.failedRequiredGateIds.join(', ')}`);
        }

        const laneKey = resolveLaneKeyFromConfig(input.platformConfig);
        const releaseLane = await this.engine.acquireLane(laneKey);

        const initResult = await this.lifecycleManager.initializeRun(url, input.prompt, {
            platformConfigJson: JSON.stringify(input.platformConfig),
            ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
        });
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
        let sessionExtras: AgentRuntimeExtras | undefined;
        let preparedSession: PreparedRunSession | undefined;

        try {
            preparedSession = await this.engine.prepareSession(input, runContext);
            automation = preparedSession.automation;
            sessionExtras = preparedSession.sessionExtras;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            yield { type: 'error', error: err };
            releaseLane();
            return;
        }

        let currentState = WorkflowState.initial();
        await this.engine.checkpoint(runId, currentState, CheckpointReason.RunInitialized);
        yield { type: 'started', runId };

        let completed = false;
        let outcome: AgentOutcome | undefined;
        let terminalError: Error | null = null;
        let suspendedReason: string | null = null;

        const initialProfile = (input.options?.observationProfile as ObservationProfile | undefined) ?? DEFAULT_OBSERVATION_PROFILE;
        const visionEnabled = input.options?.vision ?? true;
        const observation = this.engine.startObservation({ runId: runId as RunId, preparedSession, vision: visionEnabled, initialProfile });
        await observation.start();

        try {
            const urlResult = UrlFactory.create(url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);

            if (preparedSession.shouldNavigate) {
                const navResult = await automation.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await automation.waitForReady();
            }

            currentState = WorkflowState.transitionTo(currentState, 'thinking');
            yield { type: 'state_updated', state: currentState };

            const { plan, item } = this.planCoordinator.buildSinglePromptPlan(input.prompt);

            currentState = WorkflowState.transitionTo(currentState, 'thinking', { plan });
            yield { type: 'state_updated', state: currentState };
            await this.engine.checkpoint(runId, currentState, CheckpointReason.PlanReady);

            const gate = await this.controlGate.evaluate(runId, currentState, controller);
            if (gate.kind === 'cancelled') {
                completed = true;
                outcome = gate.outcome;
            } else {
                const activated = this.planCoordinator.activate(currentState, plan, item);
                currentState = activated.state;
                yield { type: 'state_updated', state: currentState };

                const executionOptions = buildRunExecutionOptions({
                    options: input.options,
                    platform: input.platformConfig.platform,
                    sessionExtras,
                    observation,
                    controller,
                });

                const kernelResult = yield* this.engine.executeStep(
                    runId,
                    item.description,
                    automation,
                    url,
                    currentState,
                    executionOptions,
                    { budgetLimits, runStartMs, estimatedTokensUsed },
                    controller,
                );

                currentState = kernelResult.state;
                estimatedTokensUsed = kernelResult.estimatedTokensUsed;
                outcome = kernelResult.outcome;

                if (kernelResult.suspendedReason) {
                    suspendedReason = kernelResult.suspendedReason;
                } else {
                    currentState = this.planCoordinator.applyOutcome(currentState, plan, activated.runningItem, outcome);
                    yield { type: 'state_updated', state: currentState };
                    completed = true;
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            terminalError = error instanceof Error ? error : new Error(msg);
            await this.engine.recordMidRunFailure(runId, msg);
        } finally {
            yield* this.engine.concludeRun({
                runId: runId as RunId,
                observation,
                preparedSession,
                releaseLane,
                completed,
                terminalError,
                outcome,
                currentState,
                suspendedReason,
                controller,
                beforeFinalize: () => this.trace.endTrace(),
            });
        }
    }
}
