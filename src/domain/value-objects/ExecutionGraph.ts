import type { Plan, PlanItemType } from '@domain/entities/Plan';

export type GraphNodeKind = 'objective' | 'skill' | 'action' | 'verification' | 'system';

export type GraphNodeState =
    | 'pending'
    | 'ready'
    | 'running'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'skipped';

export interface GraphNodeFailure {
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

export interface GraphEdge {
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
    }
};
