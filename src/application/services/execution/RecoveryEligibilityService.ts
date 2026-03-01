import { injectable } from 'tsyringe';
import type { RecoveryReadModel, CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

export type RecoveryMode = 'observe' | 'manual-only' | 'auto-safe';

export interface RecoveryDecision {
    readonly shouldRecover: boolean;
    readonly mode: RecoveryMode;
    readonly reason: string;
}

@injectable()
export class RecoveryEligibilityService {
    buildReadModel(runId: string, checkpoints: readonly CheckpointRecord[]): RecoveryReadModel {
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

    evaluatePolicy(model: RecoveryReadModel, mode: RecoveryMode = 'observe'): RecoveryDecision {
        if (mode === 'observe') {
            return {
                shouldRecover: false,
                mode,
                reason: 'Observe-only mode: runtime recovery disabled'
            };
        }

        if (!model.canResume) {
            return {
                shouldRecover: false,
                mode,
                reason: model.reason
            };
        }

        return {
            shouldRecover: mode === 'manual-only' || mode === 'auto-safe',
            mode,
            reason: model.reason
        };
    }
}
