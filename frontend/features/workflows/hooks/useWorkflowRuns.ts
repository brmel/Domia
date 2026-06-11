import { useMemo, useState } from 'react';
import { trpc } from '@frontend/api/trpc';

export function useWorkflowRuns() {
    const [selectedRunId, setSelectedRunId] = useState<string>('');
    const [selectedChildRunId, setSelectedChildRunId] = useState<string>('');

    const runsQuery = trpc.workflow.getRuns.useQuery({ limit: 30 });
    const runs = runsQuery.data ?? [];
    const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);

    const startMutation = trpc.workflow.start.useMutation({
        onSuccess: () => { void runsQuery.refetch(); }
    });
    const cancelMutation = trpc.workflow.cancel.useMutation();

    const startWorkflow = (workflowDefinitionId: string): void => {
        startMutation.mutate({ workflowDefinitionId });
    };

    return {
        runs, runsQuery,
        selectedRunId, setSelectedRunId,
        selectedChildRunId, setSelectedChildRunId,
        selectedRun,
        startMutation, cancelMutation,
        startWorkflow,
        refetchRuns: () => { void runsQuery.refetch(); },
    };
}

export type WorkflowRuns = ReturnType<typeof useWorkflowRuns>;
