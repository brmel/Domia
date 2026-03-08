export type GraphNodeState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface GraphNode {
    readonly id: string;
    readonly description: string;
    readonly kind: 'action';
    readonly state: GraphNodeState;
    readonly type?: string;
    readonly metadata?: Record<string, unknown>;
}

interface GraphEdge {
    readonly fromNodeId: string;
    readonly toNodeId: string;
}

export interface WorkflowExecutionGraph {
    readonly id: string;
    readonly sourcePlanId?: string;
    readonly version: number;
    readonly createdAt: string;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly entryNodeIds: readonly string[];
    readonly terminalNodeIds: readonly string[];
}

export const ExecutionGraph = {
    selectNextReadyNode(graph: WorkflowExecutionGraph): GraphNode | undefined {
        const incoming = new Map<string, string[]>();
        for (const edge of graph.edges) {
            const current = incoming.get(edge.toNodeId) ?? [];
            current.push(edge.fromNodeId);
            incoming.set(edge.toNodeId, current);
        }

        return graph.nodes
            .filter((node) => {
                if (node.state !== 'pending') return false;
                const deps = incoming.get(node.id) ?? [];
                if (deps.length === 0) return true;
                return deps.every((upId) => {
                    const up = graph.nodes.find((n) => n.id === upId);
                    return up && (up.state === 'completed' || up.state === 'skipped');
                });
            })
            .sort((a, b) => a.id.localeCompare(b.id))[0];
    },

    updateNodeState(graph: WorkflowExecutionGraph, nodeId: string, state: GraphNodeState): WorkflowExecutionGraph {
        return {
            ...graph,
            nodes: graph.nodes.map((node) =>
                node.id === nodeId ? { ...node, state } : node
            )
        };
    }
};
