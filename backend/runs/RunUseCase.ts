import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation } from '@domain/ports';
import type { AgentOutcome } from '@domain/ports/IAgentRuntime';
import { UrlFactory, WorkflowState } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ExecutionController } from '@backend/ExecutionController';
import { WorkflowError, ReadinessError } from '@domain/errors';
import { RunLifecycleManager } from './RunLifecycleManager';
import { RunInput, RunOutput } from '@backend/dto';
import type { RunExecutionLaneService } from './RunExecutionLaneService';
import { RunDurabilityService } from './RunDurabilityService';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';
import { StepExecutionKernelService } from './StepExecutionKernelService';

import { resolveUrlFromConfig, resolveLaneKeyFromConfig, buildExecutionOptions } from '@backend/platform/platformUrlUtils';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';
import { RunSessionService, type RunExecutionContext } from './RunSessionService';
import { RunTerminalizationService } from './RunTerminalizationService';
import { RunPlanCoordinator } from './RunPlanCoordinator';
import { RunControlGateService } from './RunControlGateService';
import { ObservationCoordinator } from '@backend/observation/ObservationCoordinator';
import { ObservationProfile, DEFAULT_OBSERVATION_PROFILE, type RunId } from '@domain/value-objects';
import type { IEventBus } from '@domain/ports/IEventBus';
import type { ILogger } from '@domain/ports';
import type { IPerceptionPipeline } from '@domain/ports';

@injectable()
export class RunUseCase {
    constructor(
        @inject(RunLifecycleManager) private lifecycleManager: RunLifecycleManager,
        @inject('ITraceService') private trace: import('@domain/ports/ITraceService').ITraceService,
        @inject('IRunExecutionLaneService') private readonly laneService: RunExecutionLaneService,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject(StepExecutionKernelService) private readonly kernel: StepExecutionKernelService,
        @inject(RunSessionService) private readonly runSessionService: RunSessionService,
        @inject(RunTerminalizationService) private readonly terminalization: RunTerminalizationService,
        @inject(RunPlanCoordinator) private readonly planCoordinator: RunPlanCoordinator,
        @inject(RunControlGateService) private readonly controlGate: RunControlGateService,
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async *execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext,
    ): AsyncGenerator<RunOutput, void, unknown> {
        const url = runContext?.session?.executionUrl ?? resolveUrlFromConfig(input.platformConfig);

        const readinessDecision = this.readinessPolicy.assess(input, url);
        if (readinessDecision.blocked) {
            yield { type: 'error', error: new ReadinessError(readinessDecision.message ?? 'Readiness gate blocked the run.') };
            return;
        }

        const laneKey = resolveLaneKeyFromConfig(input.platformConfig);
        const releaseLane = await this.laneService.acquire(laneKey);

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
        let sessionExtras: Readonly<Record<string, unknown>> | undefined;
        let preparedSession: import('./RunSessionService').PreparedRunSession | undefined;

        try {
            preparedSession = await this.runSessionService.prepare(input, runContext);
            automation = preparedSession.automation;
            sessionExtras = preparedSession.sessionExtras;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            yield { type: 'error', error: err };
            releaseLane();
            return;
        }

        let currentState = WorkflowState.initial();
        await this.durability.checkpoint(runId, currentState, CheckpointReason.RunInitialized);
        yield { type: 'started', runId };

        let completed = false;
        let outcome: AgentOutcome | undefined;
        let terminalError: Error | null = null;

        const initialProfile = (input.options?.observationProfile as ObservationProfile | undefined) ?? DEFAULT_OBSERVATION_PROFILE;
        const visionEnabled = input.options?.vision ?? true;
        const observation = new ObservationCoordinator({
            runId: runId as RunId,
            sampler: preparedSession.createObservationSampler({ perception: this.perception, vision: visionEnabled }),
            stream: preparedSession.createObservationStream(),
            events: this.events,
            logger: this.logger,
            initialProfile,
        });
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
            await this.durability.checkpoint(runId, currentState, CheckpointReason.PlanReady);

            const gate = await this.controlGate.evaluate(runId, currentState, controller);
            if (gate.kind === 'cancelled') {
                completed = true;
                outcome = gate.outcome;
            } else {
                this.kernel.throwIfBudgetExceeded(runId, budgetLimits, this.kernel.buildBudgetSnapshot({
                    actionsTaken: currentState.stepNumber,
                    runStartMs,
                    estimatedTokensUsed,
                }));

                const activated = this.planCoordinator.activate(currentState, plan, item);
                currentState = activated.state;
                yield { type: 'state_updated', state: currentState };

                const baseExtras = { ...(sessionExtras ?? {}), observation };
                const executionOptions = {
                    ...buildExecutionOptions(input.options, input.platformConfig.platform),
                    extras: baseExtras,
                };

                const kernelResult = yield* this.kernel.execute(
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

                currentState = this.planCoordinator.applyOutcome(currentState, plan, activated.runningItem, outcome);
                yield { type: 'state_updated', state: currentState };

                completed = true;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            terminalError = error instanceof Error ? error : new Error(msg);
            await this.terminalization.recordMidRunFailure(runId, msg);
        } finally {
            await observation.stop();
            if (preparedSession) {
                await this.runSessionService.dispose(preparedSession);
            }
            releaseLane();
            await this.trace.endTrace();

            yield* this.terminalization.finalize({
                runId, controller, completed, terminalError,
                outcome, currentState,
            });
        }
    }
}
