import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { RunCoordinator } from '@application/services/execution/coordinators/RunCoordinator';
import { WorkflowState } from '@domain/value-objects/WorkflowState';

describe('Execution coordinators', () => {
    it('resolves bootstrap URL and lane key deterministically', () => {
        const coordinator = new RunCoordinator();
        const input = {
            platformConfig: {
                platform: 'web',
                url: 'https://example.com'
            }
        } as unknown as never;

        expect(coordinator.resolveExecutionUrl(input)).toBe('https://example.com');
        expect(coordinator.resolveLaneKey(input)).toBe('platform:web:https://example.com');
    });

    it('builds normalized step execution options', () => {
        const coordinator = new RunCoordinator();
        const options = coordinator.buildExecutionOptions({
            maxSteps: 5,
        });

        expect(options.maxActions).toBe(5);
        expect(options.vision).toBe(true);
    });

    it('honors run-level option overrides', () => {
        const coordinator = new RunCoordinator();
        const options = coordinator.buildExecutionOptions({
            vision: false,
            maxSteps: 10,
        });

        expect(options.vision).toBe(false);
        expect(options.maxActions).toBe(10);
    });

    it('applies terminal state transitions via WorkflowState', () => {
        const state = WorkflowState.applyTerminal(
            {
                stepNumber: 1,
                status: 'thinking',
                variables: {},
                history: [{ type: ActionType.WAIT, durationMs: 10, thought: 'wait' }],
                plan: {
                    id: 'plan-1',
                    goal: 'goal',
                    status: 'executing',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    items: []
                }
            } as unknown as never,
            'failed',
            'fatal'
        );

        expect(state.status).toBe('failed');
        expect(state.error).toBe('fatal');
    });
});
