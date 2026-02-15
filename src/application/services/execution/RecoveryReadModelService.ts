import { injectable } from 'tsyringe';
import type { RecoveryReadModel, CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

@injectable()
export class RecoveryReadModelService {
    build(runId: string, checkpoints: readonly CheckpointRecord[]): RecoveryReadModel {
        const latest = checkpoints[checkpoints.length - 1];

        if (!latest) {
            return {
                runId,
                canResume: false,
                lastStableStepNumber: 0,
                suggestedStartStep: 0,
                reason: 'No checkpoints available'
            };
        }

        const step = latest.state.stepNumber;
        return {
            runId,
            canResume: true,
            lastStableStepNumber: step,
            suggestedStartStep: step,
            reason: `Resume from checkpoint at step ${step}`
        };
    }
}
