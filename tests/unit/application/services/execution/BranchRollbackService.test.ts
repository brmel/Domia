import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BranchRollbackService } from '@application/services/execution/BranchRollbackService';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

function checkpoint(input: {
    sequenceNumber: number;
    commitBoundary: boolean;
    checkpointId?: string;
    branchId?: string;
}): CheckpointRecord {
    return {
        runId: 'run-1',
        checkpointId: input.checkpointId ?? `cp-${input.sequenceNumber}`,
        parentCheckpointId: input.sequenceNumber > 1 ? `cp-${input.sequenceNumber - 1}` : null,
        branchId: input.branchId ?? 'run:run-1:main',
        sequenceNumber: input.sequenceNumber,
        commitBoundary: input.commitBoundary,
        sideEffectSetHash: null,
        createdAt: `2026-01-01T00:00:0${input.sequenceNumber}.000Z`,
        reason: 'action_applied',
        state: {
            status: 'acting',
            stepNumber: input.sequenceNumber,
            variables: {},
            history: []
        }
    };
}

describe('BranchRollbackService', () => {
    it('returns nearest commit boundary and invalidates descendants', () => {
        const service = new BranchRollbackService();
        const checkpoints = [
            checkpoint({ sequenceNumber: 1, commitBoundary: true }),
            checkpoint({ sequenceNumber: 2, commitBoundary: false }),
            checkpoint({ sequenceNumber: 3, commitBoundary: true }),
            checkpoint({ sequenceNumber: 4, commitBoundary: false })
        ];

        const result = service.rollbackToNearestBoundary('run-1', 'run:run-1:main', checkpoints);

        expect(result.rollbackCheckpoint?.checkpointId).toBe('cp-3');
        expect(result.invalidatedCheckpointIds).toEqual(['cp-4']);
    });

    it('falls back to earliest checkpoint when branch has no boundary', () => {
        const service = new BranchRollbackService();
        const checkpoints = [
            checkpoint({ sequenceNumber: 1, commitBoundary: false }),
            checkpoint({ sequenceNumber: 2, commitBoundary: false })
        ];

        const result = service.rollbackToNearestBoundary('run-1', 'run:run-1:main', checkpoints);

        expect(result.rollbackCheckpoint?.checkpointId).toBe('cp-1');
        expect(result.invalidatedCheckpointIds).toEqual(['cp-2']);
    });

    it('isolates rollback to selected branch', () => {
        const service = new BranchRollbackService();
        const checkpoints = [
            checkpoint({ sequenceNumber: 1, commitBoundary: true, branchId: 'run:run-1:main' }),
            checkpoint({ sequenceNumber: 2, commitBoundary: false, branchId: 'run:run-1:main' }),
            checkpoint({ sequenceNumber: 1, commitBoundary: true, checkpointId: 'feature-cp-1', branchId: 'run:run-1:feature' }),
            checkpoint({ sequenceNumber: 2, commitBoundary: false, checkpointId: 'feature-cp-2', branchId: 'run:run-1:feature' })
        ];

        const result = service.rollbackToNearestBoundary('run-1', 'run:run-1:feature', checkpoints);

        expect(result.rollbackCheckpoint?.checkpointId).toBe('feature-cp-1');
        expect(result.invalidatedCheckpointIds).toEqual(['feature-cp-2']);
    });
});
