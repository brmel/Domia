import { injectable, inject } from 'tsyringe';
import { ok } from 'neverthrow';
import type { RunId } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { DEFAULT_OBSERVATION_PROFILE } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import { ExecutionController } from '@backend/ExecutionController';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@backend/platform/platformUrlUtils';
import { buildRunExecutionOptions } from './runExecutionOptions';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunInput, RunOutput } from '@backend/dto';
import type { IAgentRuntime } from '@domain/ports/agent/IAgentRuntime';
import type { ILogger } from '@domain/ports';
import { RunSuspensionService } from './engine/RunSuspensionService';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';
import { RunStepEngine } from './engine/RunStepEngine';
import { RunOrchestrationService, type RunFlowContext, type RunFlowResult } from './RunOrchestrationService';

@injectable()
export class RunResumeService {
    constructor(
        @inject(RunStepEngine) private readonly engine: RunStepEngine,
        @inject(RunOrchestrationService) private readonly orchestration: RunOrchestrationService,
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

        const goal = envelope.state.plan?.goal ?? '';
        const resumeInput: RunInput = { platformConfig, prompt: goal };
        const stateRef = { current: envelope.state };
        const budget = {
            budgetLimits: this.budgetPolicy.resolveLimits(undefined),
            runStartMs: Date.now(),
            estimatedTokensUsed: 0,
        };

        const conclusion = yield* this.orchestration.orchestrate({
            input: resumeInput,
            url: resolveUrlFromConfig(platformConfig),
            laneKey: resolveLaneKeyFromConfig(platformConfig),
            stateRef,
            vision: true,
            profile: DEFAULT_OBSERVATION_PROFILE,
            controller,
            initRun: async () => ok(runId),
            announce: async (ctx) => [
                { type: 'started', runId: ctx.runId },
                { type: 'state_updated', state: ctx.stateRef.current },
            ],
            runFlow: (ctx) => this.resumeFlow(ctx, goal, platformConfig, controller, budget),
        });

        if (conclusion === 'finalized') {
            await this.engine.checkpoint(runId, stateRef.current, CheckpointReason.ActionApplied);
        }
    }

    private async *resumeFlow(
        ctx: RunFlowContext,
        goal: string,
        platformConfig: PlatformConfig,
        controller: ExecutionController,
        budget: { budgetLimits: ReturnType<RunBudgetPolicyService['resolveLimits']>; runStartMs: number; estimatedTokensUsed: number },
    ): AsyncGenerator<RunOutput, RunFlowResult, unknown> {
        const executionOptions = buildRunExecutionOptions({
            options: undefined,
            platform: platformConfig.platform,
            sessionExtras: ctx.preparedSession.sessionExtras,
            observation: ctx.observation,
            controller,
        });

        const kernelResult = yield* this.engine.executeStep(
            ctx.runId,
            goal,
            ctx.automation,
            ctx.url,
            ctx.stateRef.current,
            executionOptions,
            budget,
            controller,
        );

        ctx.stateRef.current = kernelResult.state;
        return {
            outcome: kernelResult.outcome,
            suspendedReason: kernelResult.suspendedReason ?? null,
            completed: !kernelResult.suspendedReason,
        };
    }
}
