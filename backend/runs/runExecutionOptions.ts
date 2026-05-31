import { buildExecutionOptions, type StepExecutionOptions } from '@backend/platform/platformUrlUtils';
import type { RunOptions } from '@shared/contracts/run';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { AgentRuntimeExtras } from '@domain/ports/agent/IAgentRuntime';
import type { IObservationCoordinator } from '@domain/ports/perception/IObservationCoordinator';
import type { ExecutionController } from '@backend/ExecutionController';

/**
 * Assembles a run's StepExecutionOptions: the platform/run options plus the per-run
 * extras (the observation handle + the agent-initiated suspend callback). Shared by
 * RunUseCase (fresh run) and RunResumeService (resumed run) so the extras wiring is
 * defined in exactly one place.
 */
export function buildRunExecutionOptions(params: {
    readonly options: RunOptions | undefined;
    readonly platform: PlatformType;
    readonly sessionExtras: AgentRuntimeExtras | undefined;
    readonly observation: IObservationCoordinator;
    readonly controller: ExecutionController;
}): StepExecutionOptions {
    return {
        ...buildExecutionOptions(params.options, params.platform),
        extras: {
            ...(params.sessionExtras ?? {}),
            observation: params.observation,
            onSuspendRequest: (reason: string) => params.controller.requestSuspend(reason),
        },
    };
}
