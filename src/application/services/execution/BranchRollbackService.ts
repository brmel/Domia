import { injectable } from 'tsyringe';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

export interface BranchRollbackResult {
    readonly runId: string;
    readonly branchId: string;
    readonly rollbackCheckpoint: CheckpointRecord | null;
    readonly invalidatedCheckpointIds: readonly string[];
}

@injectable()
export class BranchRollbackService {
    rollbackToNearestBoundary(
        runId: string,
        branchId: string,
        checkpoints: readonly CheckpointRecord[]
    ): BranchRollbackResult {
        const branchCheckpoints = checkpoints
            .filter((checkpoint) => checkpoint.runId === runId && checkpoint.branchId === branchId)
            .sort((left, right) => left.sequenceNumber - right.sequenceNumber);

        if (branchCheckpoints.length === 0) {
            return {
                runId,
                branchId,
                rollbackCheckpoint: null,
                invalidatedCheckpointIds: []
            };
        }

        const boundary = [...branchCheckpoints]
            .reverse()
            .find((checkpoint) => checkpoint.commitBoundary)
            ?? branchCheckpoints[0];

        if (!boundary) {
            return {
                runId,
                branchId,
                rollbackCheckpoint: null,
                invalidatedCheckpointIds: []
            };
        }

        const invalidatedCheckpointIds = branchCheckpoints
            .filter((checkpoint) => checkpoint.sequenceNumber > boundary.sequenceNumber)
            .map((checkpoint) => checkpoint.checkpointId);

        return {
            runId,
            branchId,
            rollbackCheckpoint: boundary,
            invalidatedCheckpointIds
        };
    }
}
