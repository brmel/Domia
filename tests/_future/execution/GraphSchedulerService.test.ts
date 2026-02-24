import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { WorkflowExecutionGraph } from '@domain/value-objects';
import { GraphSchedulerService } from '@application/services/execution/GraphSchedulerService';

function createGraph(): WorkflowExecutionGraph {
    return {
        id: 'graph-1',
        version: 1,
        createdAt: '2026-02-16T00:00:00.000Z',
        sourcePlanId: 'plan-1',
        nodes: [
            { id: 'A', description: 'start', kind: 'action', state: 'pending', type: 'general' },
            { id: 'B', description: 'middle', kind: 'action', state: 'pending', type: 'general' },
            { id: 'C', description: 'end', kind: 'action', state: 'pending', type: 'general' }
        ],
        edges: [
            { fromNodeId: 'A', toNodeId: 'B' },
            { fromNodeId: 'B', toNodeId: 'C' }
        ],
        entryNodeIds: ['A'],
        terminalNodeIds: ['C']
    };
}

describe('GraphSchedulerService', () => {
    it('returns only entry node as ready initially', () => {
        const service = new GraphSchedulerService();
        const ready = service.getReadyNodes(createGraph());

        expect(ready.map((node) => node.id)).toEqual(['A']);
    });

    it('unlocks dependent node when predecessor completes', () => {
        const service = new GraphSchedulerService();
        const initial = createGraph();

        const afterA = service.updateNodeState(initial, 'A', 'completed');
        const ready = service.getReadyNodes(afterA);

        expect(ready.map((node) => node.id)).toEqual(['B']);
    });

    it('selects deterministic next node from ready set', () => {
        const service = new GraphSchedulerService();
        const graph: WorkflowExecutionGraph = {
            ...createGraph(),
            nodes: [
                { id: 'B', description: 'parallel 1', kind: 'action', state: 'ready', type: 'general' },
                { id: 'A', description: 'parallel 2', kind: 'action', state: 'ready', type: 'general' },
                { id: 'C', description: 'pending', kind: 'action', state: 'pending', type: 'general' }
            ],
            edges: []
        };

        const next = service.selectNextReadyNode(graph);

        expect(next?.id).toBe('A');
    });
});
