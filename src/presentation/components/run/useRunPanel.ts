import { useState } from 'react';
import { useRunStore, useStepInspectorStore } from '../../stores';
import { trpc } from '../../trpc';
import type { RunOutput } from '@application/dtos';

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
        onData: (event) => {
            console.debug('[useRunPanel] subscription event:', event.type,
                event.type === 'error' ? (event as { error?: { message?: string } }).error : '');
            handleRunOutput(event as unknown as RunOutput);
        },
        onError: (err) => {
            console.error('[useRunPanel] subscription error:', err);
        },
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window,
    });

    const cancelMutation = trpc.run.cancel.useMutation({});

    const readinessData = readinessQuery.data;
    const readinessSummary = readinessData
        ? `${readinessData.mode}${readinessData.blocked ? ' (blocked)' : ' (allowed)'}`
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
    };
}
