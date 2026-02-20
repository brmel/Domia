import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import { RecoveryReplayIdempotencyService } from '@application/services/execution/RecoveryReplayIdempotencyService';

describe('RecoveryReplayIdempotencyService', () => {
    it('builds node replay idempotency key with run/branch/node/action format', () => {
        const persistence = {
            hasReplayIdempotencyKey: vi.fn(() => okAsync(false)),
            saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined))
        } as unknown as never;

        const service = new RecoveryReplayIdempotencyService(persistence);
        const key = service.buildNodeReplayKey({
            runId: 'run-1',
            branchId: 'run:run-1:main',
            nodeId: 'node-12',
            actionSignature: 'wait:100'
        });

        expect(key).toBe('run-1:run:run-1:main:node-12:wait:100');
    });

    it('returns false when idempotency key already exists', async () => {
        const persistence = {
            hasReplayIdempotencyKey: vi.fn(() => okAsync(true)),
            saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined))
        } as unknown as never;

        const service = new RecoveryReplayIdempotencyService(persistence);
        await expect(service.shouldExecute('run-1', 'key-1')).resolves.toBe(false);
    });

    it('throws when lookup fails', async () => {
        const persistence = {
            hasReplayIdempotencyKey: vi.fn(() => errAsync(new PersistenceError('lookup failed'))),
            saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined))
        } as unknown as never;

        const service = new RecoveryReplayIdempotencyService(persistence);
        await expect(service.shouldExecute('run-1', 'key-1')).rejects.toThrow('lookup failed');
    });

    it('marks key and throws when write fails', async () => {
        const persistence = {
            hasReplayIdempotencyKey: vi.fn(() => okAsync(false)),
            saveReplayIdempotencyKey: vi.fn(() => errAsync(new PersistenceError('write failed')))
        } as unknown as never;

        const service = new RecoveryReplayIdempotencyService(persistence);
        await expect(service.markExecuted('run-1', 'key-1')).rejects.toThrow('write failed');
    });
});
