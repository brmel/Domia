import { injectable } from 'tsyringe';
import type { GraphNode, GraphNodeState, WorkflowExecutionGraph } from '@domain/value-objects';

@injectable()
export class GraphSchedulerService {
    getReadyNodes(graph: WorkflowExecutionGraph): readonly GraphNode[] {
        const incomingByNode = this.buildIncomingMap(graph);

        const readyNodes = graph.nodes.filter((node) => {
            if (node.state !== 'pending' && node.state !== 'ready') {
                return false;
            }

            const incoming = incomingByNode.get(node.id) ?? [];
            if (incoming.length === 0) {
                return true;
            }

            return incoming.every((upstreamNodeId) => {
                const upstream = graph.nodes.find((candidate) => candidate.id === upstreamNodeId);
                if (!upstream) {
                    return false;
                }

                return upstream.state === 'completed' || upstream.state === 'skipped';
            });
        });

        return [...readyNodes].sort((left, right) => left.id.localeCompare(right.id));
    }

    selectNextReadyNode(graph: WorkflowExecutionGraph): GraphNode | undefined {
        return this.getReadyNodes(graph)[0];
    }

    updateNodeState(graph: WorkflowExecutionGraph, nodeId: string, state: GraphNodeState): WorkflowExecutionGraph {
        return {
            ...graph,
            nodes: graph.nodes.map((node) => {
                if (node.id !== nodeId) {
                    return node;
                }

                return {
                    ...node,
                    state
                };
            })
        };
    }

    private buildIncomingMap(graph: WorkflowExecutionGraph): Map<string, readonly string[]> {
        const incoming = new Map<string, string[]>();

        for (const edge of graph.edges) {
            const current = incoming.get(edge.toNodeId) ?? [];
            current.push(edge.fromNodeId);
            incoming.set(edge.toNodeId, current);
        }

        return incoming;
    }
}
