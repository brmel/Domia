import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ok } from 'neverthrow';
import { SelectiveReplannerService } from '@application/services/execution/SelectiveReplannerService';

describe('SelectiveReplannerService', () => {
    it('patches only scoped neighborhood and preserves stable nodes', async () => {
        const service = new SelectiveReplannerService();
        const currentPlan = {
            id: 'plan-1',
            goal: 'goal',
            status: 'executing' as const,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            items: [
                { id: 'A', description: 'stable predecessor', status: 'completed' as const, type: 'general' as const },
                { id: 'B', description: 'failed node', status: 'failed' as const, type: 'general' as const },
                { id: 'C', description: 'dependent node', status: 'pending' as const, type: 'general' as const },
                { id: 'D', description: 'stable tail', status: 'pending' as const, type: 'general' as const }
            ]
        };

        const planner = {
            plan: vi.fn().mockResolvedValue(ok({
                id: 'plan-2',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                items: [
                    { id: 'B1', description: 'patched step 1', status: 'pending', type: 'general' },
                    { id: 'B2', description: 'patched step 2', status: 'pending', type: 'general' }
                ]
            }))
        };

        const coordinator = {
            buildReplanPrompt: vi.fn().mockReturnValue('replan prompt')
        };

        const result = await service.replan({
            originalPrompt: 'goal',
            currentPlan,
            failedStepDescription: 'failed node',
            failureReason: 'failure',
            planner: planner as unknown as never,
            coordinator: coordinator as unknown as never,
            executionGraph: {
                id: 'graph-1',
                sourcePlanId: 'plan-1',
                version: 1,
                createdAt: '2026-01-01T00:00:00.000Z',
                nodes: [
                    { id: 'A', description: 'A', kind: 'action', state: 'completed', type: 'general' },
                    { id: 'B', description: 'B', kind: 'action', state: 'failed', type: 'general' },
                    { id: 'C', description: 'C', kind: 'action', state: 'pending', type: 'general' },
                    { id: 'D', description: 'D', kind: 'action', state: 'pending', type: 'general' }
                ],
                edges: [
                    { fromNodeId: 'A', toNodeId: 'B' },
                    { fromNodeId: 'B', toNodeId: 'C' },
                    { fromNodeId: 'C', toNodeId: 'D' }
                ],
                entryNodeIds: ['A'],
                terminalNodeIds: ['D']
            },
            failedNodeId: 'B'
        });

        expect(result.items.map((item) => item.id)).toEqual(['B1', 'B2', 'D']);
    });
});
