import { useState } from 'react';
import { trpc } from '@frontend/api/trpc';
import type { WorkflowEvent } from '@domain/WorkflowEvent';

export interface WorkflowEventView {
    readonly id: string;
    readonly label: string;
}

const FEED_LIMIT = 50;

function renderEventLabel(event: WorkflowEvent): string {
    switch (event.type) {
        case 'workflow_started':
            return `workflow_started: ${event.workflowRunId}`;
        case 'workflow_step_started':
            return `workflow_step_started: #${event.stepIndex + 1} (${event.stepId})`;
        case 'workflow_step_bound':
            return `workflow_step_bound: #${event.stepIndex + 1} -> ${event.runId}`;
        case 'workflow_step_completed':
            return `workflow_step_completed: #${event.stepIndex + 1} (${event.success ? 'success' : 'failed'})`;
        case 'workflow_completed':
            return `workflow_completed: ${event.workflowRunId} (${event.success ? 'success' : 'failed'})`;
        case 'workflow_failed':
            return `workflow_failed: ${event.reason}`;
        default: {
            const exhaustive: never = event;
            return exhaustive;
        }
    }
}

export function useWorkflowEventFeed(onEvent: () => void): WorkflowEventView[] {
    const [eventFeed, setEventFeed] = useState<WorkflowEventView[]>([]);

    trpc.workflow.onUpdate.useSubscription(undefined, {
        onData: (event) => {
            if ((event as { type: string }).type === 'cancelled') {
                return;
            }
            const label = renderEventLabel(event as WorkflowEvent);
            setEventFeed((current) => [{ id: `${Date.now()}-${Math.random()}`, label }, ...current].slice(0, FEED_LIMIT));
            onEvent();
        },
        onError: (error) => {
            setEventFeed((current) => [{ id: `${Date.now()}-error`, label: `workflow_failed: ${error.message}` }, ...current].slice(0, FEED_LIMIT));
        },
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window
    });

    return eventFeed;
}
