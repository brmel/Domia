import { injectable, inject } from 'tsyringe';
import { UrlFactory, type RunId } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ObservationProfile, DEFAULT_OBSERVATION_PROFILE } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import { ExecutionController } from '@backend/ExecutionController';
import { createRunObservationCoordinator } from './runObservation';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@backend/platform/platformUrlUtils';
import { buildRunExecutionOptions } from './runExecutionOptions';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunInput, RunOutput } from '@backend/dto';
import type { AgentOutcome, IAgentRuntime } from '@domain/ports/agent/IAgentRuntime';
import type { IPerceptionPipeline, ILogger } from '@domain/ports';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { RunExecutionLaneService } from './RunExecutionLaneService';
import { RunSessionService } from './RunSessionService';
import { RunSuspensionService } from './RunSuspensionService';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';
import { RunDurabilityService } from './RunDurabilityService';
import { RunTerminalizationService } from './RunTerminalizationService';
import { StepExecutionKernelService } from './StepExecutionKernelService';

@injectable()
export class RunResumeService {
    constructor(
        @inject(RunSuspensionService) private readonly suspensionService: RunSuspensionService,
        @inject(RunSessionService) private readonly runSessionService: RunSessionService,
        @inject('IRunExecutionLaneService') private readonly laneService: RunExecutionLaneService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunTerminalizationService) private readonly terminalization: RunTerminalizationService,
        @inject(StepExecutionKernelService) private readonly kernel: StepExecutionKernelService,
        @inject('IAgentRuntime') private readonly agentRuntime: IAgentRuntime,
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async *execute(runId: RunId, controller: ExecutionController): AsyncGenerator<RunOutput, void, unknown> {
        const envelope = await this.suspensionService.loadResumptionEnvelope(runId);
        if (!envelope) {
            yield { type: 'error', error: new WorkflowError(`No suspended state for runId=${runId}`) };
            return;
        }
        if (!envelope.platformConfigJson) {
            yield { type: 'error', error: new WorkflowError(`Missing platform config for runId=${runId}`) };
            return;
        }

        let platformConfig: PlatformConfig;
        try {
            platformConfig = JSON.parse(envelope.platformConfigJson) as PlatformConfig;
        } catch (e) {
            yield { type: 'error', error: new WorkflowError(`Invalid platform config: ${e instanceof Error ? e.message : String(e)}`) };
            return;
        }

        if (envelope.conversationSnapshot) {
            await this.agentRuntime.restoreConversation(runId, envelope.conversationSnapshot);
        }
        await this.suspensionService.markResumed(runId, envelope.state);
        this.logger.info(`[RunResumeService] Resuming runId=${runId} from ${envelope.suspendedAt}`);

        const url = resolveUrlFromConfig(platformConfig);
        const laneKey = resolveLaneKeyFromConfig(platformConfig);
        const releaseLane = await this.laneService.acquire(laneKey);

        const resumeInput: RunInput = {
            platformConfig,
            prompt: envelope.state.plan?.goal ?? '',
        };

        let preparedSession: Awaited<ReturnType<RunSessionService['prepare']>> | undefined;
        try {
            preparedSession = await this.runSessionService.prepare(resumeInput);
        } catch (error) {
            releaseLane();
            yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
            return;
        }

        const visionEnabled = true;
        const initialProfile: ObservationProfile = DEFAULT_OBSERVATION_PROFILE;
        const observation = createRunObservationCoordinator({
            runId,
            preparedSession,
            perception: this.perception,
            events: this.events,
            logger: this.logger,
            vision: visionEnabled,
            initialProfile,
        });
        await observation.start();

        let currentState = envelope.state;
        let outcome: AgentOutcome | undefined;
        let terminalError: Error | null = null;
        let completed = false;
        let suspendedReason: string | null = null;
        const runStartMs = Date.now();
        let estimatedTokensUsed = 0;
        const budgetLimits = this.budgetPolicy.resolveLimits(undefined);

        yield { type: 'started', runId };
        yield { type: 'state_updated', state: currentState };

        try {
            const urlResult = UrlFactory.create(url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);
            if (preparedSession.shouldNavigate) {
                const navResult = await preparedSession.automation.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await preparedSession.automation.waitForReady();
            }

            const goal = envelope.state.plan?.goal ?? '';
            const executionOptions = buildRunExecutionOptions({
                options: undefined,
                platform: platformConfig.platform,
                sessionExtras: preparedSession.sessionExtras,
                observation,
                controller,
            });

            const kernelResult = yield* this.kernel.execute(
                runId,
                goal,
                preparedSession.automation,
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
                completed = true;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            terminalError = error instanceof Error ? error : new Error(msg);
            await this.terminalization.recordMidRunFailure(runId, msg);
        } finally {
            await observation.stop();
            if (preparedSession) await this.runSessionService.dispose(preparedSession);
            releaseLane();

            if (suspendedReason && !terminalError) {
                try {
                    await this.suspensionService.suspend(runId, currentState, suspendedReason);
                    yield { type: 'suspended', runId, reason: suspendedReason };
                } catch (error) {
                    yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
                }
                // eslint-disable-next-line no-unsafe-finally -- intentional: the finally block IS the terminalization path; the suspended case returns here to skip finalize()
                return;
            }

            yield* this.terminalization.finalize({
                runId, controller, completed, terminalError,
                outcome, currentState,
            });
        }

        await this.durability.checkpoint(runId, currentState, CheckpointReason.ActionApplied);
    }
}
