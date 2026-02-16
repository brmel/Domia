import { injectable } from 'tsyringe';
import type { Plan } from '@domain/entities/Plan';
import type { LLMEvaluationDecision } from '@domain/value-objects';
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
        evaluatorAdvice?: string
    ): string {
        const planOutline = currentPlan.items
            .map(item => `- [${item.status}] ${item.description}`)
            .join('\n');

        const evaluationContext = lastEvaluation
            ? [
                `Evaluator decision: ${lastEvaluation.decision}`,
                `Evaluator summary: ${lastEvaluation.summary}`,
                ...(lastEvaluation.advice ? [`Evaluator advice: ${lastEvaluation.advice}`] : [])
            ].join('\n')
            : 'No explicit evaluator decision captured for this failure.';

        return [
            `Original request: ${originalPrompt}`,
            'Current plan execution failed and must be replanned.',
            `Failed step: ${failedStepDescription}`,
            `Failure reason: ${failureReason}`,
            'Evaluator context:',
            evaluationContext,
            ...(evaluatorAdvice ? ['Latest evaluator advice in workflow state:', evaluatorAdvice] : []),
            'Previous plan:',
            planOutline,
            'Produce a revised plan that avoids repeating failed assumptions and keeps the same overall objective.'
        ].join('\n\n');
    }
}
