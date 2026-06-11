import { injectable, inject } from 'tsyringe';
import type { Result } from 'neverthrow';
import { UrlFactory, type RunId, type WorkflowState, type ObservationProfile } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import type { IStructuredAutomation } from '@domain/ports';
import type { AgentOutcome } from '@domain/ports/agent/IAgentRuntime';
import type { ExecutionController } from '@backend/ExecutionController';
import type { RunInput, RunOutput } from '@backend/dto';
import type { PreparedRunSession, RunExecutionContext } from './engine/RunSessionService';
import { RunStepEngine } from './engine/RunStepEngine';

export interface RunFlowContext {
    readonly runId: RunId;
    readonly url: string;
    readonly preparedSession: PreparedRunSession;
    readonly automation: IStructuredAutomation;
    readonly observation: ReturnType<RunStepEngine['startObservation']>;
    readonly stateRef: { current: WorkflowState };
}

export interface RunFlowResult {
    readonly outcome: AgentOutcome | undefined;
    readonly suspendedReason: string | null;
    readonly completed: boolean;
}

export type RunConclusion = 'suspended' | 'finalized' | 'aborted';

export interface RunOrchestrationParams {
    readonly input: RunInput;
    readonly url: string;
    readonly laneKey: string;
    readonly stateRef: { current: WorkflowState };
    readonly vision: boolean;
    readonly profile: ObservationProfile;
    readonly controller: ExecutionController;
    readonly runContext?: RunExecutionContext;
    readonly beforeFinalize?: () => Promise<void>;
    readonly initRun: () => Promise<Result<RunId, Error>>;
    readonly announce: (ctx: RunFlowContext) => Promise<readonly RunOutput[]>;
    readonly runFlow: (ctx: RunFlowContext) => AsyncGenerator<RunOutput, RunFlowResult, unknown>;
}

@injectable()
export class RunOrchestrationService {
    constructor(@inject(RunStepEngine) private readonly engine: RunStepEngine) {}

    async *orchestrate(p: RunOrchestrationParams): AsyncGenerator<RunOutput, RunConclusion, unknown> {
        const releaseLane = await this.engine.acquireLane(p.laneKey);

        const initResult = await p.initRun();
        if (initResult.isErr()) {
            releaseLane();
            yield { type: 'error', error: initResult.error };
            return 'aborted';
        }
        const runId = initResult.value;

        let preparedSession: PreparedRunSession;
        try {
            preparedSession = await this.engine.prepareSession(p.input, p.runContext);
        } catch (error) {
            releaseLane();
            yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
            return 'aborted';
        }

        const observation = this.engine.startObservation({
            runId,
            preparedSession,
            vision: p.vision,
            initialProfile: p.profile,
        });
        await observation.start();

        const ctx: RunFlowContext = {
            runId,
            url: p.url,
            preparedSession,
            automation: preparedSession.automation,
            observation,
            stateRef: p.stateRef,
        };

        for (const output of await p.announce(ctx)) {
            yield output;
        }

        let outcome: AgentOutcome | undefined;
        let terminalError: Error | null = null;
        let completed = false;
        let suspendedReason: string | null = null;
        let conclusion: RunConclusion = 'finalized';

        try {
            const urlResult = UrlFactory.create(p.url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);

            if (preparedSession.shouldNavigate) {
                const navResult = await ctx.automation.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await ctx.automation.waitForReady();
            }

            const result = yield* p.runFlow(ctx);
            outcome = result.outcome;
            suspendedReason = result.suspendedReason;
            completed = result.completed;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            terminalError = error instanceof Error ? error : new Error(msg);
            await this.engine.recordMidRunFailure(runId, msg);
        } finally {
            conclusion = yield* this.engine.concludeRun({
                runId,
                observation,
                preparedSession,
                releaseLane,
                completed,
                terminalError,
                outcome,
                currentState: ctx.stateRef.current,
                suspendedReason,
                controller: p.controller,
                ...(p.beforeFinalize ? { beforeFinalize: p.beforeFinalize } : {}),
            });
        }
        return conclusion;
    }
}
