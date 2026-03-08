import type { Plan } from '@domain/entities/Plan';
import type { WorkflowExecutionGraph } from '@domain/value-objects/ExecutionGraph';

interface ObjectiveCompletionAssessment {
    readonly success: boolean;
    readonly summary: string;
    readonly unmetObjectives: readonly string[];
}

export function assessObjectiveCompletion(params: {
    plan?: Plan;
    executionGraph?: WorkflowExecutionGraph;
    hasUnresolvedVerificationFailure: boolean;
    failureSummary?: string;
}): ObjectiveCompletionAssessment {
    if (params.hasUnresolvedVerificationFailure) {
        return {
            success: false,
            summary: params.failureSummary ?? 'Run ended with unresolved verification failures.',
            unmetObjectives: []
        };
    }

    const graphNodes = params.executionGraph?.nodes ?? [];
    const hasGraph = graphNodes.length > 0;

    if (hasGraph) {
        const failedNodes = graphNodes.filter((node) => node.state === 'failed');
        if (failedNodes.length > 0) {
            return {
                success: false,
                summary: `Run ended with failed objectives (${failedNodes.length}).`,
                unmetObjectives: failedNodes.map((node) => node.description)
            };
        }

        const unmetGraphObjectives = graphNodes
            .filter((node) => node.state !== 'completed' && node.state !== 'skipped')
            .map((node) => node.description);

        if (unmetGraphObjectives.length > 0) {
            return {
                success: false,
                summary: `Run ended before completing all objectives (${unmetGraphObjectives.length} remaining).`,
                unmetObjectives: unmetGraphObjectives
            };
        }

        return {
            success: true,
            summary: 'Completed successfully.',
            unmetObjectives: []
        };
    }

    const items = params.plan?.items ?? [];
    const unmetObjectives = items
        .filter((item) => item.status !== 'completed')
        .map((item) => item.description);

    if (unmetObjectives.length > 0) {
        return {
            success: false,
            summary: `Run ended before completing all objectives (${unmetObjectives.length} remaining).`,
            unmetObjectives
        };
    }

    return {
        success: true,
        summary: 'Completed successfully.',
        unmetObjectives: []
    };
}
