import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import { PersistenceError } from '@domain/errors';
import { RecoveryReplayService } from '@application/services/execution/RecoveryReplayService';

describe('RecoveryReplayService', () => {
    describe('guardAction', () => {
        const persistence = {
            hasReplayIdempotencyKey: vi.fn(() => okAsync(false)),
            saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined))
        } as unknown as never;
        const service = new RecoveryReplayService(persistence);

        it('allows replay for idempotent action classes', () => {
            const actions: AgentAction[] = [
                { type: ActionType.WAIT, durationMs: 300, thought: 'wait' },
                { type: ActionType.SCROLL, direction: 'down', thought: 'scroll' },
                { type: ActionType.MOUSE_MOVE, x: 10, y: 20, thought: 'move' },
                { type: ActionType.MOUSE_SCROLL, deltaX: 0, deltaY: 300, thought: 'wheel' },
                { type: ActionType.EXTRACT, ref: 'e1', thought: 'extract' },
                { type: ActionType.NAVIGATE, url: 'https://example.com', thought: 'navigate' },
                { type: ActionType.OBSERVE, thought: 'observe' }
            ];

            for (const action of actions) {
                const decision = service.guardAction(action);
                expect(decision.decision).toBe('replay');
            }
        });

        it('blocks non-idempotent action classes', () => {
            const actions: AgentAction[] = [
                { type: ActionType.CLICK, ref: 'e2', thought: 'click' },
                { type: ActionType.TYPE, ref: 'e3', text: 'abc', thought: 'type' },
                { type: ActionType.MOUSE_CLICK_LEFT, x: 10, y: 20, thought: 'left click' },
                { type: ActionType.MOUSE_CLICK_RIGHT, x: 10, y: 20, thought: 'right click' },
                { type: ActionType.MOUSE_DOUBLE_CLICK, x: 10, y: 20, thought: 'double click' },
                { type: ActionType.MOUSE_DRAG, fromX: 5, fromY: 5, toX: 40, toY: 40, thought: 'drag' },
                { type: ActionType.PRESS_KEY, key: 'Enter', thought: 'press' }
            ];

            for (const action of actions) {
                const decision = service.guardAction(action);
                expect(decision.decision).toBe('block');
            }
        });

        it('skips terminal actions', () => {
            const passDecision = service.guardAction({ type: ActionType.PASS, summary: 'ok' });
            const failDecision = service.guardAction({ type: ActionType.FAIL, reason: 'bad' });

            expect(passDecision.decision).toBe('skip');
            expect(failDecision.decision).toBe('skip');
        });
    });

    describe('idempotency', () => {
        it('builds node replay idempotency key with run/branch/node/action format', () => {
            const persistence = {
                hasReplayIdempotencyKey: vi.fn(() => okAsync(false)),
                saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined))
            } as unknown as never;

            const service = new RecoveryReplayService(persistence);
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

            const service = new RecoveryReplayService(persistence);
            await expect(service.shouldExecute('run-1', 'key-1')).resolves.toBe(false);
        });

        it('throws when lookup fails', async () => {
            const persistence = {
                hasReplayIdempotencyKey: vi.fn(() => errAsync(new PersistenceError('lookup failed'))),
                saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined))
            } as unknown as never;

            const service = new RecoveryReplayService(persistence);
            await expect(service.shouldExecute('run-1', 'key-1')).rejects.toThrow('lookup failed');
        });

        it('marks key and throws when write fails', async () => {
            const persistence = {
                hasReplayIdempotencyKey: vi.fn(() => okAsync(false)),
                saveReplayIdempotencyKey: vi.fn(() => errAsync(new PersistenceError('write failed')))
            } as unknown as never;

            const service = new RecoveryReplayService(persistence);
            await expect(service.markExecuted('run-1', 'key-1')).rejects.toThrow('write failed');
        });
    });
});
