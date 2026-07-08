import { injectable } from 'tsyringe';
import { nanoid } from 'nanoid';
import { WorkflowState } from '@domain/value-objects';
import { Plan, PlanItem } from '@domain/entities/Plan';
import type { AgentOutcome } from '@domain/ports/agent/IAgentRuntime';
import { isOutcomeSuccessful } from './outcomes';

interface BuiltPlan {
    readonly plan: Plan;
    readonly item: PlanItem;
}

@injectable()
export class RunPlanCoordinator {
    buildSinglePromptPlan(prompt: string): BuiltPlan {
        const now = new Date();
        const item: PlanItem = { id: nanoid(), description: prompt, status: 'pending', type: 'app' };
        const plan: Plan = {
            id: nanoid(),
            goal: prompt,
            status: 'executing',
            createdAt: now,
            updatedAt: now,
            items: [item],
        };
        return { plan, item };
    }

    activate(state: WorkflowState, plan: Plan, item: PlanItem): { state: WorkflowState; runningItem: PlanItem } {
        const runningItem = PlanItem.activate(item);
        const nextState = WorkflowState.transitionTo(state, 'observing', {
            activeItemId: runningItem.id,
            plan: { ...plan, items: [runningItem] },
        });
        return { state: nextState, runningItem };
    }

    applyOutcome(state: WorkflowState, plan: Plan, runningItem: PlanItem, outcome: AgentOutcome | undefined): WorkflowState {
        if (outcome && isOutcomeSuccessful(outcome)) {
            const completedItem = PlanItem.complete(runningItem);
            return WorkflowState.transitionTo(
                WorkflowState.clearActiveItem(state),
                'idle',
                { plan: { ...plan, items: [completedItem] } },
            );
        }

        const failedItem = PlanItem.fail(runningItem);
        const errorMsg = outcome ? describeOutcome(outcome) : 'unknown_error';
        return WorkflowState.transitionTo(
            WorkflowState.clearActiveItem(state),
            'failed',
            { error: errorMsg, plan: { ...plan, items: [failedItem] } },
        );
    }
}

function describeOutcome(outcome: AgentOutcome): string {
    switch (outcome.kind) {
        case 'done':
            return outcome.output.summary || 'agent finished';
        case 'iterate':
            return outcome.summary || 'iterating';
        case 'stopped':
            return `${outcome.reason}: ${outcome.summary}`;
        case 'error':
            return `error: ${outcome.cause.message}`;
    }
}
