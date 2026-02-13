import { injectable } from 'tsyringe';
import type { RecoveryReadModel } from '@domain/value-objects/CheckpointReadModel';

export type RecoveryMode = 'observe' | 'manual-only' | 'auto-safe';

export interface RecoveryDecision {
    readonly shouldRecover: boolean;
    readonly mode: RecoveryMode;
    readonly reason: string;
}

@injectable()
export class RunRecoveryPolicyService {
    decide(model: RecoveryReadModel, mode: RecoveryMode = 'observe'): RecoveryDecision {
        if (mode === 'observe') {
            return {
                shouldRecover: false,
                mode,
                reason: 'Observe-only mode (scaffold): no runtime recovery yet'
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
            shouldRecover: mode === 'auto-safe',
            mode,
            reason: model.reason
        };
    }
}
