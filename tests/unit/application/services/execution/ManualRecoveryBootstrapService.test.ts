import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ManualRecoveryBootstrapService } from '@application/services/execution/ManualRecoveryBootstrapService';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { Plan } from '@domain/entities/Plan';
import { ActionType } from '@domain/enums/ActionType';

function createPlan(items: Plan['items']): Plan {
    const now = new Date('2026-01-01T00:00:00.000Z');
    return {
        id: 'plan-1',
        goal: 'resume run',
        items,
        status: 'executing',
        createdAt: now,
        updatedAt: now
    };
}

describe('ManualRecoveryBootstrapService', () => {
    const service = new ManualRecoveryBootstrapService();

    it('maps pending planning state and derives active item when missing', () => {
        const checkpointState: WorkflowState = {
            status: 'thinking',
            stepNumber: 2,
            variables: { key: 'value' },
            history: [],
            plan: createPlan([
                { id: 'a', description: 'done', status: 'completed', type: 'general' },
                { id: 'b', description: 'next', status: 'pending', type: 'code' }
            ])
        };

        const result = service.bootstrapFromCheckpoint(checkpointState);

        expect(result.state.status).toBe('planning');
        expect(result.state.activeItemId).toBe('b');
        expect(result.startPlanIndex).toBe(1);
        expect(result.state.variables).toEqual({ key: 'value' });
    });

    it('maps fully completed plans to completed workflow state', () => {
        const checkpointState: WorkflowState = {
            status: 'acting',
            stepNumber: 4,
            variables: {},
            history: [],
            plan: createPlan([
                { id: 'a', description: 'done', status: 'completed', type: 'general' },
                { id: 'b', description: 'done', status: 'completed', type: 'code' }
            ])
        };

        const result = service.bootstrapFromCheckpoint(checkpointState);

        expect(result.state.status).toBe('completed');
        expect(result.startPlanIndex).toBe(2);
    });

    it('keeps checkpoint history snapshot intact', () => {
        const checkpointState: WorkflowState = {
            status: 'acting',
            stepNumber: 1,
            variables: {},
            history: [
                {
                    type: ActionType.NAVIGATE,
                    url: 'https://example.com',
                    thought: 'go to page'
                }
            ],
            plan: createPlan([
                { id: 'a', description: 'continue', status: 'active', type: 'general' }
            ])
        };

        const result = service.bootstrapFromCheckpoint(checkpointState);

        expect(result.state.history).toHaveLength(1);
        expect(result.state.activeItemId).toBe('a');
        expect(result.state.status).toBe('acting');
    });
});
