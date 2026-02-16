import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CheckpointCompactionService } from './CheckpointCompactionService';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

function checkpoint(step: number, createdAt: string): CheckpointRecord {
    return {
        runId: 'run-1',
        checkpointId: `cp-${step}`,
        parentCheckpointId: step > 1 ? `cp-${step - 1}` : null,
        branchId: 'run:run-1:main',
        sequenceNumber: step,
        createdAt,
        reason: 'action_applied',
        state: {
            status: 'acting',
            stepNumber: step,
            variables: {},
            history: []
        }
    };
}

describe('CheckpointCompactionService', () => {
    it('returns empty view for empty checkpoint list', () => {
        const service = new CheckpointCompactionService();
        const result = service.compact('run-1', []);

        expect(result.latest).toBeNull();
        expect(result.compacted).toEqual([]);
    });

    it('keeps latest checkpoint in compacted result', () => {
        const service = new CheckpointCompactionService();
        const checkpoints = [
            checkpoint(1, '2026-01-01T00:00:00.000Z'),
            checkpoint(2, '2026-01-01T00:00:01.000Z'),
            checkpoint(3, '2026-01-01T00:00:02.000Z')
        ];

        const result = service.compact('run-1', checkpoints, { keepEveryNth: 2, maxRecent: 1 });

        expect(result.latest?.state.stepNumber).toBe(3);
        expect(result.compacted.some(c => c.state.stepNumber === 3)).toBe(true);
    });
});
