import { useMemo, useState } from 'react';
import { useRunStore, useStepInspectorStore } from '../../stores';
import { trpc } from '../../trpc';
import { RunState } from '@domain/enums/RunState';

export function useRunPanel() {
    const {
        status, currentAction, plan, history, success, summary,
        errorMessage, handleEvent, runId, recoveryReplay, replanningEvents,
    } = useRunStore();
    const { open } = useStepInspectorStore();

    const [rightRailTab, setRightRailTab] = useState<'execution' | 'safety'>('execution');
    const [workspaceTab, setWorkspaceTab] = useState<'plan' | 'state' | 'timeline' | 'checkpoints'>('plan');
    const [actionOverrideJson, setActionOverrideJson] = useState('');
    const [actionOverrideError, setActionOverrideError] = useState<string | null>(null);

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
            handleEvent(event as Parameters<typeof handleEvent>[0]);
        },
        onError: () => {},
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window,
    });

    const cancelMutation = trpc.run.cancel.useMutation({});

    const overrideActionMutation = trpc.run.overrideAction.useMutation({
        onSuccess: () => {
            setActionOverrideError(null);
            setActionOverrideJson('');
        },
        onError: (err) => {
            setActionOverrideError(err.message);
        },
    });

    const checkpoints = useMemo(() => {
        const records: Array<{ id: string; reason: string; detail: string }> = [];
        if (runId) {
            records.push({ id: `${runId}-init`, reason: 'run_initialized', detail: `Run ${runId} started` });
        }
        if (plan?.items?.length) {
            records.push({ id: 'plan-ready', reason: 'plan_ready', detail: `${plan.items.length} plan item(s) prepared` });
        }
        history.forEach((action, index) => {
            records.push({
                id: `action-${index + 1}`,
                reason: 'action_applied',
                detail: `Step ${index + 1}: ${action.type}`,
            });
        });
        if (status === RunState.COMPLETED) {
            records.push({
                id: success ? 'terminal-success' : 'terminal-failure',
                reason: success ? 'terminal_success' : 'terminal_failure',
                detail: success ? 'Run completed successfully' : 'Run completed with failure',
            });
        }
        if (status === RunState.CANCELLED) {
            records.push({ id: 'terminal-cancelled', reason: 'terminal_cancelled', detail: 'Run cancelled by operator' });
        }
        return records;
    }, [history, plan?.items?.length, runId, status, success]);

    const readinessData = readinessQuery.data;
    const readinessSummary = readinessData
        ? `${readinessData.mode}${readinessData.blocked ? ' (blocked)' : ' (allowed)'}`
        : 'Not available yet';

    const policyFlags = readinessData?.report.gates
        .filter(gate => gate.id.endsWith('_flag_alignment'))
        .map(gate => ({
            label: gate.id.replace('_flag_alignment', '').replace(/_/g, ' '),
            enabled: gate.passed,
        })) ?? [];

    const checkpointRecords = checkpointsQuery.data?.map((record, index) => ({
        id: `${record.createdAt}-${index}`,
        reason: record.reason,
        detail: `Step ${record.state.stepNumber}: ${record.state.status}`,
    })) ?? checkpoints;

    const recentPolicyEvents = history.slice(-5).map((action, index) => ({
        id: `${index}-${action.type}`,
        action: action.type,
        decision: action.type === 'fail' ? 'deny' : action.type === 'pass' ? 'allow' : 'observe',
    }));

    const handleOpenInspect = (stepNum: number): void => {
        if (!runId) return;
        open(runId, stepNum);
    };

    const handleQueueActionOverride = (): void => {
        if (status !== RunState.RUNNING) {
            setActionOverrideError('Action override is only available while a run is active.');
            return;
        }
        try {
            const parsedAction = JSON.parse(actionOverrideJson);
            overrideActionMutation.mutate({ action: parsedAction });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setActionOverrideError(`Invalid JSON: ${message}`);
        }
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
        recoveryReplay,
        replanningEvents,
        rightRailTab,
        setRightRailTab,
        workspaceTab,
        setWorkspaceTab,
        actionOverrideJson,
        setActionOverrideJson,
        actionOverrideError,
        setActionOverrideError,
        cancelMutation,
        overrideActionMutation,
        checkpointsQuery,
        readinessQuery,
        readinessData,
        readinessSummary,
        policyFlags,
        checkpointRecords,
        recentPolicyEvents,
        handleOpenInspect,
        handleQueueActionOverride,
    };
}
