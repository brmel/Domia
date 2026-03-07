import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig, buildExecutionOptions } from '@application/services/platform/platformUrlUtils';
import { WorkflowState } from '@domain/value-objects/WorkflowState';

describe('Execution coordinators', () => {
    it('resolves bootstrap URL and lane key deterministically', () => {
        const config = { platform: 'web' as const, url: 'https://example.com' };

        expect(resolveUrlFromConfig(config)).toBe('https://example.com');
        expect(resolveLaneKeyFromConfig(config)).toBe('platform:web:https://example.com');
    });

    it('builds normalized step execution options', () => {
        const options = buildExecutionOptions({ maxSteps: 5 });

        expect(options.maxActions).toBe(5);
        expect(options.vision).toBe(true);
    });

    it('honors run-level option overrides', () => {
        const options = buildExecutionOptions({ vision: false, maxSteps: 10 });

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
