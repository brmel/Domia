import { injectable } from 'tsyringe';
import type { Plan } from '@domain/entities/Plan';
import type { LLMEvaluationDecision, WorkflowExecutionGraph, EvaluatorAdviceDelta } from '@domain/value-objects';
import type { ReplanningTrigger } from '@application/services/execution/ReplanningPolicyService';

type StepFailureCode =
    | 'assertion_fail'
    | 'perception_error'
    | 'llm_error'
    | 'loop_detected'
    | 'action_execution_error'
    | 'agent_fail'
    | 'max_actions_reached';

@injectable()
export class ReplanningCoordinator {
    mapResultCodeToTrigger(code: StepFailureCode): ReplanningTrigger | undefined {
        switch (code) {
            case 'loop_detected':
                return 'loop_detected';
            case 'action_execution_error':
                return 'action_execution_error';
            case 'assertion_fail':
            case 'agent_fail':
                return 'assertion_fail';
            case 'max_actions_reached':
                return 'max_actions_reached';
            case 'perception_error':
            case 'llm_error':
                return undefined;
            default: {
                const exhaustiveCheck: never = code;
                return exhaustiveCheck;
            }
        }
    }

    buildReplanPrompt(
        originalPrompt: string,
        currentPlan: Plan,
        failedStepDescription: string,
        failureReason: string,
        lastEvaluation?: LLMEvaluationDecision,
        evaluatorAdvice?: string,
        evaluatorAdviceDelta?: EvaluatorAdviceDelta,
        executionGraph?: WorkflowExecutionGraph,
        failedNodeId?: string
    ): string {
        const planOutline = currentPlan.items
            .map(item => `- [${item.status}] ${item.description}`)
            .join('\n');
        const selectiveScope = this.buildSelectiveScope(executionGraph, failedNodeId);

        const evaluationContext = lastEvaluation
            ? [
                `Evaluator decision: ${lastEvaluation.decision}`,
                `Evaluator summary: ${lastEvaluation.summary}`,
                `Evaluator confidence: ${lastEvaluation.confidence}`,
                `Evaluator evidence: ${lastEvaluation.evidence.join(' | ')}`,
                ...(lastEvaluation.advice ? [`Evaluator advice: ${lastEvaluation.advice}`] : [])
            ].join('\n')
            : 'No explicit evaluator decision captured for this failure.';

        const adviceDeltaContext = evaluatorAdviceDelta
            ? [
                `Decision: ${evaluatorAdviceDelta.decision}`,
                `Summary: ${evaluatorAdviceDelta.summary}`,
                ...(evaluatorAdviceDelta.advice ? [`Advice: ${evaluatorAdviceDelta.advice}`] : []),
                `Confidence: ${evaluatorAdviceDelta.confidence}`,
                `Evidence: ${evaluatorAdviceDelta.evidence.join(' | ') || 'none'}`,
                `Timestamp: ${evaluatorAdviceDelta.timestamp}`
            ].join('\n')
            : 'No structured evaluator advice delta available.';

        return [
            `Original request: ${originalPrompt}`,
            'Current plan execution failed and must be replanned.',
            `Failed step: ${failedStepDescription}`,
            `Failure reason: ${failureReason}`,
            'Evaluator context:',
            evaluationContext,
            'Selective replanning scope:',
            selectiveScope,
            ...(evaluatorAdvice ? ['Latest evaluator advice in workflow state:', evaluatorAdvice] : []),
            'Evaluator advice delta:',
            adviceDeltaContext,
            'Previous plan:',
            planOutline,
            'Produce a revised plan that prioritizes patching only the affected scope while keeping stable nodes unchanged and preserving the same overall objective.'
        ].join('\n\n');
    }

    private buildSelectiveScope(executionGraph?: WorkflowExecutionGraph, failedNodeId?: string): string {
        if (!executionGraph || !failedNodeId) {
            return 'Graph context unavailable; planner may patch globally.';
        }

        const incoming = executionGraph.edges
            .filter((edge) => edge.toNodeId === failedNodeId)
            .map((edge) => edge.fromNodeId);
        const outgoing = executionGraph.edges
            .filter((edge) => edge.fromNodeId === failedNodeId)
            .map((edge) => edge.toNodeId);

        const scopeNodeIds = [failedNodeId, ...incoming, ...outgoing];
        const uniqueScope = [...new Set(scopeNodeIds)];
        const scopeDetails = uniqueScope
            .map((id) => {
                const node = executionGraph.nodes.find((candidate) => candidate.id === id);
                if (!node) {
                    return `- [unknown] ${id}`;
                }

                return `- [${node.state}] ${node.id}: ${node.description}`;
            })
            .join('\n');

        return [
            `Failed node: ${failedNodeId}`,
            `Incoming dependencies: ${incoming.length > 0 ? incoming.join(', ') : 'none'}`,
            `Outgoing dependents: ${outgoing.length > 0 ? outgoing.join(', ') : 'none'}`,
            'Scope nodes:',
            scopeDetails
        ].join('\n');
    }
}
