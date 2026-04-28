import { useState } from 'react';
import { useRunStore } from '@frontend/features/runs/store';
import { useStepInspectorStore } from '@frontend/features/runs/stepInspectorStore';
import { trpc } from '@frontend/api/trpc';
import type { RunOutput } from '@backend/dto';

export function useRunPanel() {
    const {
        status, currentAction, plan, history, success, summary,
        errorMessage, handleRunOutput, runId,
    } = useRunStore();
    const { open } = useStepInspectorStore();

    const [rightRailTab, setRightRailTab] = useState<'execution' | 'safety'>('execution');
    const [workspaceTab, setWorkspaceTab] = useState<'plan' | 'state' | 'timeline'>('plan');

    const checkpointsQuery = trpc.run.getCheckpoints.useQuery(
        { runId: runId ?? '' },
        { enabled: Boolean(runId) },
    );

    const readinessQuery = trpc.run.getReadiness.useQuery(
        { runId: runId ?? '' },
        { enabled: Boolean(runId) },
    );

    trpc.run.onUpdate.useSubscription(undefined, {
        onData: (event) => handleRunOutput(event as unknown as RunOutput),
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window,
    });

    const cancelMutation = trpc.run.cancel.useMutation({});
    const generateReportMutation = trpc.run.generateReport.useMutation({});

    const generateReport = (formats: Array<'junit' | 'html'>): void => {
        if (!runId) return;
        generateReportMutation.mutate({ runId, formats });
    };

    const readinessData = readinessQuery.data;
    const readinessSummary = readinessData
        ? readinessData.report.passed ? 'All gates passed' : `Advisory: ${readinessData.report.failedRequiredGateIds.join(', ')}`
        : 'Not available yet';

    const policyFlags = readinessData?.report.gates
        .map(gate => ({
            label: gate.description,
            enabled: gate.passed,
        })) ?? [];

    const checkpointRecords = checkpointsQuery.data?.map((record, index) => ({
        id: `${record.createdAt}-${index}`,
        reason: record.reason,
        detail: `Step ${record.state.stepNumber}: ${record.state.status}`,
    })) ?? [];

    const recentPolicyEvents = readinessData?.report.gates.map((gate) => ({
        id: gate.id,
        action: gate.description,
        decision: gate.passed ? 'allow' : gate.required ? 'deny' : 'observe',
    })) ?? [];

    const handleOpenInspect = (stepNum: number): void => {
        if (!runId) return;
        open(runId, stepNum);
    };

    return {
        status,
        currentAction,
        plan,
        history,
        success,
        summary,
        errorMessage,
        runId,
        rightRailTab,
        setRightRailTab,
        workspaceTab,
        setWorkspaceTab,
        cancelMutation,
        checkpointsQuery,
        readinessQuery,
        readinessData,
        readinessSummary,
        policyFlags,
        checkpointRecords,
        recentPolicyEvents,
        handleOpenInspect,
        generateReport,
        generateReportMutation,
    };
}
