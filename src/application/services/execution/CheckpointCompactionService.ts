import { injectable } from 'tsyringe';
import type {
    CheckpointCompactionPolicy,
    CheckpointRecord,
    CompactedCheckpointView
} from '@domain/value-objects/CheckpointReadModel';

const DEFAULT_POLICY: CheckpointCompactionPolicy = {
    keepEveryNth: 5,
    maxRecent: 20
};

@injectable()
export class CheckpointCompactionService {
    compact(runId: string, checkpoints: readonly CheckpointRecord[], policy: CheckpointCompactionPolicy = DEFAULT_POLICY): CompactedCheckpointView {
        if (checkpoints.length === 0) {
            return {
                runId,
                latest: null,
                compacted: []
            };
        }

        const latest = checkpoints[checkpoints.length - 1] ?? null;
        const recent = checkpoints.slice(-policy.maxRecent);
        const sampled = checkpoints.filter((_, index) => index % Math.max(1, policy.keepEveryNth) === 0);

        const dedup = new Map<string, CheckpointRecord>();
        for (const checkpoint of [...sampled, ...recent]) {
            const key = `${checkpoint.createdAt}:${checkpoint.reason}:${checkpoint.state.stepNumber}`;
            dedup.set(key, checkpoint);
        }

        return {
            runId,
            latest,
            compacted: [...dedup.values()]
        };
    }
}
