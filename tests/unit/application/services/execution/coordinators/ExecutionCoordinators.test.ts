import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { PlanningCoordinator } from '@application/services/execution/coordinators/PlanningCoordinator';
import { RunCoordinator } from '@application/services/execution/coordinators/RunCoordinator';
import { ReplanningCoordinator } from '@application/services/execution/coordinators/ReplanningCoordinator';

describe('Execution coordinators', () => {
    it('builds a single-step plan from a prompt', () => {
        const coordinator = new PlanningCoordinator();
        const plan = coordinator.buildSingleStepPlan('base goal');

        expect(plan.goal).toBe('base goal');
        expect(plan.items).toHaveLength(1);
        expect(plan.items[0]?.description).toBe('base goal');
        expect(plan.items[0]?.status).toBe('pending');
    });

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

    it('maps replanning triggers', () => {
        const coordinator = new ReplanningCoordinator();
        expect(coordinator.mapResultCodeToTrigger('loop_detected')).toBe('loop_detected');
        expect(coordinator.mapResultCodeToTrigger('assertion_fail')).toBe('assertion_fail');
        expect(coordinator.mapResultCodeToTrigger('agent_fail')).toBe('assertion_fail');
        expect(coordinator.mapResultCodeToTrigger('max_actions_reached')).toBe('max_actions_reached');
        expect(coordinator.mapResultCodeToTrigger('perception_error')).toBeUndefined();
        expect(coordinator.mapResultCodeToTrigger('llm_error')).toBeUndefined();
    });

    it('applies terminal state transitions', () => {
        const coordinator = new RunCoordinator();
        const state = coordinator.applyTerminalState(
            {
                stepNumber: 1,
                status: 'thinking',
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
