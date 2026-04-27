import { inject, injectable } from 'tsyringe';
import type { RunId } from '@domain/value-objects/Brand';
import type { WorkflowState } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { AgentOutcome } from '@domain/ports/IAgentRuntime';
import { RunState } from '@domain/enums';
import { ExecutionController } from '@backend/ExecutionController';
import { RunDurabilityService } from './RunDurabilityService';

type ControlGateDecision =
    | { readonly kind: 'proceed' }
    | { readonly kind: 'cancelled'; readonly outcome: AgentOutcome };

@injectable()
export class RunControlGateService {
    constructor(
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
    ) {}

    async evaluate(runId: RunId, state: WorkflowState, controller: ExecutionController): Promise<ControlGateDecision> {
        if (controller.state === RunState.PAUSED) {
            await this.durability.checkpoint(runId, state, CheckpointReason.PauseRequested);
            await controller.waitForResume();
            await this.durability.checkpoint(runId, state, CheckpointReason.ResumeRequested);
        }

        if (controller.state === RunState.CANCELLED) {
            return {
                kind: 'cancelled',
                outcome: { kind: 'stopped', reason: 'cancelled', summary: 'Cancelled by user.' },
            };
        }

        return { kind: 'proceed' };
    }
}
