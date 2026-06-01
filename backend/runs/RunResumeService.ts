import { injectable, inject } from 'tsyringe';
import { UrlFactory, type RunId } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ObservationProfile, DEFAULT_OBSERVATION_PROFILE } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import { ExecutionController } from '@backend/ExecutionController';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@backend/platform/platformUrlUtils';
import { buildRunExecutionOptions } from './runExecutionOptions';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunInput, RunOutput } from '@backend/dto';
import type { AgentOutcome, IAgentRuntime } from '@domain/ports/agent/IAgentRuntime';
import type { ILogger } from '@domain/ports';
import type { PreparedRunSession } from './RunSessionService';
import { RunSuspensionService } from './RunSuspensionService';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';
import { RunStepEngine } from './RunStepEngine';

@injectable()
export class RunResumeService {
    constructor(
        @inject(RunStepEngine) private readonly engine: RunStepEngine,
        @inject(RunSuspensionService) private readonly suspensionService: RunSuspensionService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject('IAgentRuntime') private readonly agentRuntime: IAgentRuntime,
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
        const releaseLane = await this.engine.acquireLane(laneKey);

        const resumeInput: RunInput = {
            platformConfig,
            prompt: envelope.state.plan?.goal ?? '',
        };

        let preparedSession: PreparedRunSession | undefined;
        try {
            preparedSession = await this.engine.prepareSession(resumeInput);
        } catch (error) {
            releaseLane();
            yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
            return;
        }

        const visionEnabled = true;
        const initialProfile: ObservationProfile = DEFAULT_OBSERVATION_PROFILE;
        const observation = this.engine.startObservation({ runId, preparedSession, vision: visionEnabled, initialProfile });
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

        let conclusion: 'suspended' | 'finalized' = 'finalized';
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

            const kernelResult = yield* this.engine.executeStep(
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
            await this.engine.recordMidRunFailure(runId, msg);
        } finally {
            conclusion = yield* this.engine.concludeRun({
                runId, observation, preparedSession, releaseLane,
                completed, terminalError, outcome, currentState, suspendedReason, controller,
            });
        }

        if (conclusion === 'finalized') {
            await this.engine.checkpoint(runId, currentState, CheckpointReason.ActionApplied);
        }
    }
}
