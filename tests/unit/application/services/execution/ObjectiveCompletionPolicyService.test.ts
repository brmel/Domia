import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { assessObjectiveCompletion } from '@application/services/execution/ObjectiveCompletionPolicyService';

describe('ObjectiveCompletionPolicyService', () => {
    it('fails when unresolved verification failure exists', () => {
        

        const result = assessObjectiveCompletion({
            hasUnresolvedVerificationFailure: true,
            failureSummary: 'Verification failed: mismatch detected'
        });

        expect(result.success).toBe(false);
        expect(result.summary).toContain('Verification failed');
    });

    it('fails when plan still has non-completed items', () => {
        

        const result = assessObjectiveCompletion({
            hasUnresolvedVerificationFailure: false,
            plan: {
                id: 'plan-1',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: [
                    { id: '1', description: 'done', status: 'completed', type: 'general' },
                    { id: '2', description: 'pending', status: 'pending', type: 'general' }
                ]
            }
        });

        expect(result.success).toBe(false);
        expect(result.unmetObjectives).toHaveLength(1);
        expect(result.unmetObjectives[0]).toContain('pending');
    });

    it('passes when all objectives are completed and no unresolved failures', () => {
        

        const result = assessObjectiveCompletion({
            hasUnresolvedVerificationFailure: false,
            plan: {
                id: 'plan-1',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: [
                    { id: '1', description: 'done', status: 'completed', type: 'general' }
                ]
            }
        });

        expect(result.success).toBe(true);
        expect(result.summary).toBe('Completed successfully.');
    });

    it('passes when execution graph indicates completion even if plan statuses are stale', () => {
        

        const result = assessObjectiveCompletion({
            hasUnresolvedVerificationFailure: false,
            plan: {
                id: 'plan-1',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: [
                    { id: '1', description: 'stale pending', status: 'pending', type: 'general' }
                ]
            },
            executionGraph: {
                id: 'graph-1',
                version: 1,
                createdAt: new Date().toISOString(),
                nodes: [{ id: '1', description: 'stale pending', kind: 'action', state: 'completed' }],
                edges: [],
                entryNodeIds: ['1'],
                terminalNodeIds: ['1']
            }
        });

        expect(result.success).toBe(true);
        expect(result.summary).toBe('Completed successfully.');
    });
});
