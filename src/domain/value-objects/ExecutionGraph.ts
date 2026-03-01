import type { Plan, PlanItemType } from '@domain/entities/Plan';

type GraphNodeKind = 'objective' | 'skill' | 'action' | 'verification' | 'system';

export type GraphNodeState =
    | 'pending'
    | 'ready'
    | 'running'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'skipped';

interface GraphNodeFailure {
    readonly code: string;
    readonly reason: string;
    readonly attemptCount: number;
    readonly lastVerifierDecision?: 'sub_task_success' | 'need_retry' | 'need_reformulate';
}

export interface GraphNode {
    readonly id: string;
    readonly description: string;
    readonly kind: GraphNodeKind;
    readonly state: GraphNodeState;
    readonly type?: PlanItemType;
    readonly metadata?: Record<string, unknown>;
    readonly failure?: GraphNodeFailure;
}

interface GraphEdge {
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly condition?: string;
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
    fromPlan(plan: Plan): WorkflowExecutionGraph {
        const nodes: readonly GraphNode[] = plan.items.map((item) => ({
            id: item.id,
            description: item.description,
            kind: 'action',
            state: this.mapPlanStatus(item.status),
            type: item.type,
            ...(item.metadata ? { metadata: item.metadata } : {})
        }));

        const edges: readonly GraphEdge[] = plan.items.flatMap((item, index) => {
            const next = plan.items[index + 1];
            if (!next) {
                return [];
            }

            return [{ fromNodeId: item.id, toNodeId: next.id }];
        });

        const firstItem = plan.items[0];
        const lastItem = plan.items[plan.items.length - 1];

        return {
            id: `graph-${plan.id}`,
            sourcePlanId: plan.id,
            version: 1,
            createdAt: new Date().toISOString(),
            nodes,
            edges,
            entryNodeIds: firstItem ? [firstItem.id] : [],
            terminalNodeIds: lastItem ? [lastItem.id] : []
        };
    },

    mapPlanStatus(status: 'pending' | 'active' | 'completed' | 'failed'): GraphNodeState {
        switch (status) {
            case 'pending':
                return 'pending';
            case 'active':
                return 'running';
            case 'completed':
                return 'completed';
            case 'failed':
                return 'failed';
            default: {
                const exhaustiveStatus: never = status;
                return exhaustiveStatus;
            }
        }
    },

    getReadyNodes(graph: WorkflowExecutionGraph): readonly GraphNode[] {
        const incoming = new Map<string, string[]>();
        for (const edge of graph.edges) {
            const current = incoming.get(edge.toNodeId) ?? [];
            current.push(edge.fromNodeId);
            incoming.set(edge.toNodeId, current);
        }

        return graph.nodes
            .filter((node) => {
                if (node.state !== 'pending' && node.state !== 'ready') return false;
                const deps = incoming.get(node.id) ?? [];
                if (deps.length === 0) return true;
                return deps.every((upId) => {
                    const up = graph.nodes.find((n) => n.id === upId);
                    return up && (up.state === 'completed' || up.state === 'skipped');
                });
            })
            .sort((a, b) => a.id.localeCompare(b.id));
    },

    selectNextReadyNode(graph: WorkflowExecutionGraph): GraphNode | undefined {
        return this.getReadyNodes(graph)[0];
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
