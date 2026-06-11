import { injectable, inject } from 'tsyringe';
import type { RunId, WorkflowState } from '@domain/value-objects';
import type { ObservationProfile } from '@domain/value-objects';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { RunInput, RunOutput } from '@backend/dto';
import type { ExecutionController } from '@backend/ExecutionController';
import type { AgentOutcome } from '@domain/ports/agent/IAgentRuntime';
import type { IStructuredAutomation, IPerceptionPipeline, ILogger } from '@domain/ports';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { IRunExecutionLaneService } from './RunExecutionLaneService';
import { StepExecutionKernelService } from './StepExecutionKernelService';
import { RunDurabilityService } from './RunDurabilityService';
import { RunTerminalizationService } from './RunTerminalizationService';
import { RunSuspensionService } from './RunSuspensionService';
import { RunSessionService, type PreparedRunSession, type RunExecutionContext } from './RunSessionService';
import { createRunObservationCoordinator } from '../runObservation';

type StepExecutionOptions = Parameters<StepExecutionKernelService['execute']>[5];
type BudgetContext = Parameters<StepExecutionKernelService['execute']>[6];
type Observation = ReturnType<typeof createRunObservationCoordinator>;

interface ConcludeParams {
    readonly runId: RunId;
    readonly observation: Observation;
    readonly preparedSession: PreparedRunSession | undefined;
    readonly releaseLane: () => void;
    readonly completed: boolean;
    readonly terminalError: Error | null;
    readonly outcome: AgentOutcome | undefined;
    readonly currentState: WorkflowState;
    readonly suspendedReason: string | null;
    readonly controller: ExecutionController;
    readonly beforeFinalize?: () => Promise<void>;
}

@injectable()
export class RunStepEngine {
    constructor(
        @inject(StepExecutionKernelService) private readonly kernel: StepExecutionKernelService,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject(RunTerminalizationService) private readonly terminalization: RunTerminalizationService,
        @inject(RunSuspensionService) private readonly suspension: RunSuspensionService,
        @inject(RunSessionService) private readonly session: RunSessionService,
        @inject('IRunExecutionLaneService') private readonly laneService: IRunExecutionLaneService,
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    acquireLane(laneKey: string): Promise<() => void> {
        return this.laneService.acquire(laneKey);
    }

    prepareSession(input: RunInput, runContext?: RunExecutionContext): Promise<PreparedRunSession> {
        return this.session.prepare(input, runContext);
    }

    disposeSession(prepared: PreparedRunSession): Promise<void> {
        return this.session.dispose(prepared);
    }

    checkpoint(runId: RunId, state: WorkflowState, reason: CheckpointReason): Promise<void> {
        return this.durability.checkpoint(runId, state, reason);
    }

    recordMidRunFailure(runId: RunId, message: string): Promise<void> {
        return this.terminalization.recordMidRunFailure(runId, message);
    }

    startObservation(params: { runId: RunId; preparedSession: PreparedRunSession; vision: boolean; initialProfile: ObservationProfile }): Observation {
        return createRunObservationCoordinator({
            runId: params.runId,
            preparedSession: params.preparedSession,
            perception: this.perception,
            events: this.events,
            logger: this.logger,
            vision: params.vision,
            initialProfile: params.initialProfile,
        });
    }

    executeStep(
        runId: RunId,
        goal: string,
        automation: IStructuredAutomation,
        url: string,
        state: WorkflowState,
        executionOptions: StepExecutionOptions,
        budget: BudgetContext,
        controller: ExecutionController,
    ): ReturnType<StepExecutionKernelService['execute']> {
        return this.kernel.execute(runId, goal, automation, url, state, executionOptions, budget, controller);
    }

    /**
     * The shared terminal tail (runs in the caller's `finally`): stop observation,
     * dispose the session, release the lane, then either suspend or finalize.
     * Returns which path ran so a caller can do path-specific post-work (resume's
     * final checkpoint runs only after finalize). The suspend/finalize decision
     * lives here so neither orchestrator needs the `no-unsafe-finally` dance.
     */
    async *concludeRun(p: ConcludeParams): AsyncGenerator<RunOutput, 'suspended' | 'finalized', unknown> {
        await p.observation.stop();
        if (p.preparedSession) await this.disposeSession(p.preparedSession);
        p.releaseLane();
        if (p.beforeFinalize) await p.beforeFinalize();

        if (p.suspendedReason && !p.terminalError) {
            try {
                await this.suspension.suspend(p.runId, p.currentState, p.suspendedReason);
                yield { type: 'suspended', runId: p.runId, reason: p.suspendedReason };
            } catch (error) {
                yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
            }
            return 'suspended';
        }

        yield* this.terminalization.finalize({
            runId: p.runId,
            controller: p.controller,
            completed: p.completed,
            terminalError: p.terminalError,
            outcome: p.outcome,
            currentState: p.currentState,
        });
        return 'finalized';
    }
}
