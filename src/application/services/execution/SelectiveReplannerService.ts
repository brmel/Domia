import { injectable } from 'tsyringe';
import type { Plan } from '@domain/entities/Plan';
import type { WorkflowExecutionGraph, LLMEvaluationDecision, EvaluatorAdviceDelta } from '@domain/value-objects';
import type { WorkflowPlanner } from '../planning/WorkflowPlanner';
import type { ReplanningCoordinator } from './coordinators/ReplanningCoordinator';

export interface SelectiveReplanInput {
    readonly originalPrompt: string;
    readonly currentPlan: Plan;
    readonly failedStepDescription: string;
    readonly failureReason: string;
    readonly planner: WorkflowPlanner;
    readonly coordinator: ReplanningCoordinator;
    readonly lastEvaluation?: LLMEvaluationDecision;
    readonly evaluatorAdvice?: string;
    readonly evaluatorAdviceDelta?: EvaluatorAdviceDelta;
    readonly executionGraph?: WorkflowExecutionGraph;
    readonly failedNodeId?: string;
}

@injectable()
export class SelectiveReplannerService {
    async replan(input: SelectiveReplanInput): Promise<Plan> {
        const prompt = input.coordinator.buildReplanPrompt(
            input.originalPrompt,
            input.currentPlan,
            input.failedStepDescription,
            input.failureReason,
            input.lastEvaluation,
            input.evaluatorAdvice,
            input.evaluatorAdviceDelta,
            input.executionGraph,
            input.failedNodeId
        );

        const replannedResult = await input.planner.plan(prompt);
        if (replannedResult.isErr()) {
            throw new Error(replannedResult.error.message);
        }

        const replanned = replannedResult.value;
        if (replanned.items.length === 0) {
            throw new Error('Replanned output contained no actionable items');
        }

        if (!input.executionGraph || !input.failedNodeId) {
            return replanned;
        }

        const scopedNodeIds = this.resolveScopeNodeIds(input.executionGraph, input.failedNodeId);
        if (scopedNodeIds.size === 0) {
            return replanned;
        }

        const mergedItems = this.mergeScopedItems(input.currentPlan, replanned, scopedNodeIds);

        return {
            ...replanned,
            items: mergedItems,
            updatedAt: new Date()
        };
    }

    private resolveScopeNodeIds(graph: WorkflowExecutionGraph, failedNodeId: string): Set<string> {
        const incoming = graph.edges
            .filter((edge) => edge.toNodeId === failedNodeId)
            .map((edge) => edge.fromNodeId);
        const outgoing = graph.edges
            .filter((edge) => edge.fromNodeId === failedNodeId)
            .map((edge) => edge.toNodeId);

        return new Set([failedNodeId, ...incoming, ...outgoing]);
    }

    private mergeScopedItems(currentPlan: Plan, replanned: Plan, scopedNodeIds: Set<string>): Plan['items'] {
        const merged: Plan['items'] = [];
        let injectedScope = false;

        for (const item of currentPlan.items) {
            if (scopedNodeIds.has(item.id)) {
                if (!injectedScope) {
                    merged.push(...replanned.items.map((replannedItem) => ({
                        ...replannedItem,
                        status: 'pending' as const
                    })));
                    injectedScope = true;
                }
                continue;
            }

            merged.push(item);
        }

        if (!injectedScope) {
            merged.push(...replanned.items.map((replannedItem) => ({
                ...replannedItem,
                status: 'pending' as const
            })));
        }

        return merged;
    }
}
