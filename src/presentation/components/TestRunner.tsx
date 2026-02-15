import React, { useMemo, useState } from 'react';
import { useTestRunStore, useStepInspectorStore } from '../stores';
import type { AgentAction } from '@domain/value-objects';
import { cn } from '../../lib/utils';
import { trpc } from '../../lib/trpc';
import { AgentStatus } from '../../domain/types/AgentStatus';
import { SegmentedControl } from './ui/SegmentedControl';
import { InfoCard } from './ui/InfoCard';
import { SectionBlock } from './ui/SectionBlock';
import { RunTimelineView } from './RunTimelineView';


export function TestRunner(): React.ReactElement {
    const { status, currentAction, plan, history, success, summary, errorMessage, handleEvent, testRunId: runId, recoveryReplay, replanningEvents } =
        useTestRunStore();
    const { open } = useStepInspectorStore();
    const [rightRailTab, setRightRailTab] = useState<'execution' | 'safety'>('execution');
    const [workspaceTab, setWorkspaceTab] = useState<'plan' | 'state' | 'timeline' | 'checkpoints'>('plan');

    const checkpointsQuery = trpc.test.getCheckpoints.useQuery(
        { runId: runId ?? '' },
        { enabled: Boolean(runId) }
    );

    const readinessQuery = trpc.test.getReadiness.useQuery(
        { runId: runId ?? '' },
        { enabled: Boolean(runId) }
    );

    trpc.test.onUpdate.useSubscription(undefined, {
        onData: (event) => {
            handleEvent(event as Parameters<typeof handleEvent>[0]);
        },
        onError: (err) => {
            console.error('Subscription error:', err);
        },
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window
    });

    const cancelMutation = trpc.test.cancel.useMutation({
        onError: (err) => {
            console.error('Failed to cancel test:', err);
        }
    });

    // Helper to safely get thought if it exists
    const getThought = (action: AgentAction): string | undefined => {
        return 'thought' in action ? (action as { thought?: string }).thought : undefined;
    };

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
                detail: `Step ${index + 1}: ${action.type}`
            });
        });

        if (status === AgentStatus.COMPLETED) {
            records.push({
                id: success ? 'terminal-success' : 'terminal-failure',
                reason: success ? 'terminal_success' : 'terminal_failure',
                detail: success ? 'Run completed successfully' : 'Run completed with failure'
            });
        }

        if (status === AgentStatus.CANCELLED) {
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
            enabled: gate.passed
        })) ?? [];

    const checkpointRecords = checkpointsQuery.data?.map((record, index) => ({
        id: `${record.createdAt}-${index}`,
        reason: record.reason,
        detail: `Step ${record.state.stepNumber}: ${record.state.status}`
    })) ?? checkpoints;

    const recentPolicyEvents = history.slice(-5).map((action, index) => ({
        id: `${index}-${action.type}`,
        action: action.type,
        decision: action.type === 'fail' ? 'deny' : action.type === 'pass' ? 'allow' : 'observe'
    }));

    const handleOpenInspect = (stepNum: number): void => {
        if (!runId) {
            return;
        }
        open(runId, stepNum);
    };

    return (
        <div className="w-full h-full min-h-0 p-4 overflow-hidden">
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,45%)_minmax(0,1fr)] gap-3">
                <div className="min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 text-sm">Run Workspace</h3>
                        <SegmentedControl
                            items={[
                                { value: 'execution', label: 'Execution' },
                                { value: 'safety', label: 'Safety' }
                            ] as const}
                            value={rightRailTab}
                            onChange={setRightRailTab}
                            className="bg-white"
                            activeItemClassName="bg-blue-50 text-blue-700"
                        />
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                        {rightRailTab === 'execution' && (
                            <SegmentedControl
                                items={[
                                    { value: 'plan', label: 'Plan' },
                                    { value: 'state', label: 'State' },
                                    { value: 'timeline', label: 'Timeline' },
                                    { value: 'checkpoints', label: 'Checkpoints' }
                                ] as const}
                                value={workspaceTab}
                                onChange={setWorkspaceTab}
                                fullWidth
                            />
                        )}

                        {rightRailTab === 'execution' && workspaceTab === 'plan' && (
                            <div className="space-y-4">
                                {plan?.items?.map((item, i) => (
                                    <div key={i} className={cn(
                                        "relative pl-6 py-1 transition-all",
                                        item.status === 'active' ? "opacity-100" : "opacity-80"
                                    )}>
                                        {i !== plan.items.length - 1 && (
                                            <div className="absolute left-2.75 top-6 -bottom-4 w-0.5 bg-gray-100"></div>
                                        )}

                                        <div className={cn(
                                            "absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 z-10 bg-white",
                                            item.status === 'completed' ? "border-green-500 text-green-600" :
                                                item.status === 'active' ? "border-blue-500 text-blue-600 ring-2 ring-blue-100" :
                                                    item.status === 'failed' ? "border-red-500 text-red-600" :
                                                        "border-gray-200 text-gray-300"
                                        )}>
                                            {item.status === 'completed' && <span className="text-[10px] font-bold">✓</span>}
                                            {item.status === 'failed' && <span className="text-[10px] font-bold">✕</span>}
                                            {item.status === 'active' && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>}
                                            {item.status === 'pending' && <span className="text-[10px]">○</span>}
                                        </div>

                                        <div className={cn(
                                            "text-sm",
                                            item.status === 'active' ? "font-semibold text-gray-900" :
                                                item.status === 'completed' ? "text-gray-500" :
                                                    "text-gray-400"
                                        )}>
                                            {item.description}
                                        </div>
                                        {item.status === 'failed' && item.error && (
                                            <div className="mt-1 text-xs text-red-500 bg-red-50 p-2 rounded">
                                                {item.error}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {!plan?.items?.length && (
                                    <div className="text-xs text-gray-500">No plan available yet for this run.</div>
                                )}
                            </div>
                        )}

                        {rightRailTab === 'execution' && workspaceTab === 'state' && (
                            <div className="space-y-3 text-xs">
                                <InfoCard label="Run Status" value={status} />
                                <InfoCard label="History Length" value={`${history.length} action(s)`} />
                                <InfoCard label="Current Action" value={currentAction?.type ?? 'None'} />
                                <InfoCard
                                    label="Recovery Replay"
                                    value={recoveryReplay
                                        ? `${recoveryReplay.status} (${recoveryReplay.replayedCount}/${recoveryReplay.targetStepNumber})`
                                        : 'Not active'}
                                    detail={recoveryReplay?.reason}
                                />
                                <InfoCard
                                    label="Terminal Summary"
                                    value={<span className="font-normal text-gray-800 line-clamp-4 whitespace-pre-wrap">{summary || errorMessage || 'Not available yet'}</span>}
                                />
                            </div>
                        )}

                        {rightRailTab === 'execution' && workspaceTab === 'checkpoints' && (
                            <div className="space-y-2">
                                {checkpointsQuery.isLoading && (
                                    <div className="text-xs text-gray-500">Loading persisted checkpoints…</div>
                                )}
                                {checkpointsQuery.isError && (
                                    <div className="text-xs text-red-600">Could not load persisted checkpoints. Showing local summary.</div>
                                )}
                                {checkpointRecords.map((checkpoint) => (
                                    <div key={checkpoint.id} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                                        <div className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">{checkpoint.reason}</div>
                                        <div className="mt-1 text-xs text-gray-600">{checkpoint.detail}</div>
                                    </div>
                                ))}
                                {checkpointRecords.length === 0 && (
                                    <div className="text-xs text-gray-500">No checkpoint events yet.</div>
                                )}
                            </div>
                        )}

                        {rightRailTab === 'execution' && workspaceTab === 'timeline' && (
                            <RunTimelineView
                                statusLabel={status}
                                actionTypes={history.map(action => action.type)}
                                checkpoints={checkpointRecords}
                                recoveryReplay={recoveryReplay}
                                replanningEvents={replanningEvents}
                            />
                        )}

                        {rightRailTab === 'safety' && (
                            <div className="space-y-3">
                                {readinessQuery.isLoading && (
                                    <div className="text-xs text-gray-500">Loading readiness report…</div>
                                )}
                                {readinessQuery.isError && (
                                    <div className="text-xs text-red-600">Could not load readiness report yet.</div>
                                )}

                                <SectionBlock title="Readiness">
                                    <InfoCard
                                        label="Gate mode"
                                        value={readinessSummary}
                                        detail={readinessData?.message}
                                    />
                                </SectionBlock>

                                <SectionBlock title="Policy Flags">
                                    <div className="grid grid-cols-2 gap-2">
                                        {policyFlags.map((flag) => (
                                            <div key={flag.label} className="rounded-md border border-gray-200 px-2 py-1.5 bg-gray-50">
                                                <div className="text-[11px] text-gray-600 capitalize">{flag.label}</div>
                                                <div className={cn('text-xs font-semibold', flag.enabled ? 'text-green-700' : 'text-gray-500')}>
                                                    {flag.enabled ? 'Enabled' : 'Disabled'}
                                                </div>
                                            </div>
                                        ))}
                                        {policyFlags.length === 0 && (
                                            <div className="col-span-2 text-xs text-gray-500">No policy alignment records yet.</div>
                                        )}
                                    </div>
                                </SectionBlock>

                                <SectionBlock title="Recent Policy View">
                                    <div className="space-y-1.5">
                                        {recentPolicyEvents.map((event) => (
                                            <div key={event.id} className="rounded-md border border-gray-200 px-2 py-1.5 bg-gray-50 flex items-center justify-between">
                                                <span className="text-xs text-gray-700">{event.action}</span>
                                                <span className={cn(
                                                    'text-[11px] font-semibold uppercase',
                                                    event.decision === 'allow' && 'text-green-700',
                                                    event.decision === 'deny' && 'text-red-700',
                                                    event.decision === 'observe' && 'text-blue-700'
                                                )}>
                                                    {event.decision}
                                                </span>
                                            </div>
                                        ))}
                                        {recentPolicyEvents.length === 0 && (
                                            <div className="text-xs text-gray-500">No policy-relevant action events yet.</div>
                                        )}
                                    </div>
                                </SectionBlock>
                            </div>
                        )}
                    </div>
                </div>

                <div className="min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-w-0">
                    {/* Header Actions */}
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                        <div>
                            <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                                <span className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-300",
                                    status === AgentStatus.RUNNING && "bg-blue-500 animate-pulse ring-2 ring-blue-500/30",
                                    status === AgentStatus.COMPLETED && "bg-green-500 ring-2 ring-green-500/30",
                                    status === AgentStatus.CANCELLED && "bg-yellow-500",
                                    status === AgentStatus.FAILED && "bg-red-500"
                                )}></span>
                                Activity Log
                            </h3>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">
                                Status: {status.toUpperCase()}
                            </div>
                        </div>

                        {status === AgentStatus.RUNNING && (
                            <button
                                onClick={() => cancelMutation.mutate()}
                                disabled={cancelMutation.isPending}
                                className="text-xs font-medium text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors border border-transparent hover:border-red-100 disabled:opacity-50"
                            >
                                {cancelMutation.isPending ? 'Stopping...' : 'Stop Agent'}
                            </button>
                        )}
                    </div>

                    {/* Log Content */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 font-mono text-sm relative">
                        {/* Welcome Message */}
                        {history.length === 0 && !currentAction && status === AgentStatus.IDLE && (
                            <div className="text-gray-400 text-center mt-10 italic">
                                Agent is ready. Waiting for instructions...
                            </div>
                        )}

                        {/* Pending Action (Currently executing) - Show at Top if running */}
                        {currentAction && status === AgentStatus.RUNNING && (
                            <div className="border-l-4 border-blue-500 pl-4 py-3 bg-blue-50/10 animate-pulse rounded-r-lg">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Processing</span>
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
                                </div>
                                <div className="text-gray-900 font-bold text-lg mb-1">{currentAction.type}</div>
                                {getThought(currentAction) && (
                                    <div className="text-gray-600 text-sm italic leading-relaxed">"{getThought(currentAction)}"</div>
                                )}
                            </div>
                        )}

                        {/* Result Card (Inlined if completed) */}
                        {(status === AgentStatus.COMPLETED || status === AgentStatus.FAILED) && (
                            <div className={cn(
                                "p-4 rounded-xl border-l-4 shadow-sm mb-4 bg-white",
                                success ? "bg-green-50/50 border-green-500 text-green-900" : "bg-red-50/50 border-red-500 text-red-900"
                            )}>
                                <div className="flex items-start gap-4">
                                    <div className={`p-2 rounded-full ${success ? 'bg-green-100' : 'bg-red-100'}`}>
                                        <span className="text-2xl">{success ? '🎉' : '❌'}</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-base uppercase tracking-wide mb-1">
                                            {success ? 'Goal Achieved' : 'Goal Failed'}
                                        </h4>
                                        <p className="text-sm leading-relaxed opacity-90 whitespace-pre-wrap">
                                            {status === AgentStatus.FAILED ? errorMessage : summary}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* History Steps (Newest first) */}
                        {history.slice().reverse().map((action, i) => {
                            const stepNum = history.length - i;
                            return (
                                <div
                                    key={i}
                                    onClick={() => handleOpenInspect(stepNum)}
                                    className="group flex gap-4 p-3 rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-all cursor-pointer"
                                >
                                    <span className="text-xs font-bold text-gray-400 mt-1 w-6">#{stepNum}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={cn(
                                                "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                                                action.type === 'fail' ? 'bg-red-100 text-red-700' :
                                                    action.type === 'pass' ? 'bg-green-100 text-green-700' :
                                                        'bg-gray-100 text-gray-600'
                                            )}>
                                                {action.type}
                                            </span>
                                            {/* Hover prompt to inspect */}
                                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-blue-500 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                                                OPEN
                                            </span>

                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleOpenInspect(stepNum);
                                                }}
                                                disabled={!runId}
                                                className="ml-auto rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                            >
                                                Inspect
                                            </button>
                                        </div>

                                        {/* Show thought for history items too if available */}
                                        {getThought(action) && (
                                            <p className="text-gray-500 text-xs mt-1 line-clamp-2 italic group-hover:line-clamp-none">
                                                "{getThought(action)}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
