import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { RunDurabilityService } from '@application/services/execution/RunDurabilityService';

describe('RunDurabilityService', () => {
    it('skips duplicate checkpoints with identical signatures', async () => {
        const persistence = {
            saveCheckpoint: vi.fn(() => okAsync(undefined))
        };

        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            error: vi.fn()
        };

        const service = new RunDurabilityService(persistence as unknown as never, logger as unknown as never);
        const state = {
            stepNumber: 1,
            status: 'thinking',
            history: [],
            plan: {
                id: 'plan-1',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: []
            }
        } as unknown as never;

        await service.checkpoint('run-1', state, 'plan_ready');
        await service.checkpoint('run-1', state, 'plan_ready');

        expect(persistence.saveCheckpoint).toHaveBeenCalledTimes(1);
    });
});
