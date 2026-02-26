import type { ReactElement } from 'react';
import { useRunPanel } from './useRunPanel';
import { SegmentedControl } from '../ui/SegmentedControl';
import { RunPlanView } from './RunPlanView';
import { RunStateView } from './RunStateView';
import { RunCheckpointsView } from './RunCheckpointsView';
import { RunSafetyView } from './RunSafetyView';
import { RunActivityLog } from './RunActivityLog';
import { RunTimelineView } from './RunTimelineView';

export function RunPanel(): ReactElement {
    const vm = useRunPanel();

    return (
        <div className="w-full h-full min-h-0 p-4 overflow-hidden">
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,45%)_minmax(0,1fr)] gap-3">
                <div className="min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 text-sm">Run Workspace</h3>
                        <SegmentedControl
                            items={[
                                { value: 'execution', label: 'Execution' },
                                { value: 'safety', label: 'Safety' },
                            ] as const}
                            value={vm.rightRailTab}
                            onChange={vm.setRightRailTab}
                            className="bg-white"
                            activeItemClassName="bg-blue-50 text-blue-700"
                        />
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                        {vm.rightRailTab === 'execution' && (
                            <SegmentedControl
                                items={[
                                    { value: 'plan', label: 'Plan' },
                                    { value: 'state', label: 'State' },
                                    { value: 'timeline', label: 'Timeline' },
                                    { value: 'checkpoints', label: 'Checkpoints' },
                                ] as const}
                                value={vm.workspaceTab}
                                onChange={vm.setWorkspaceTab}
                                fullWidth
                            />
                        )}

                        {vm.rightRailTab === 'execution' && vm.workspaceTab === 'plan' && (
                            <RunPlanView plan={vm.plan} />
                        )}

                        {vm.rightRailTab === 'execution' && vm.workspaceTab === 'state' && (
                            <RunStateView
                                status={vm.status}
                                history={vm.history}
                                currentAction={vm.currentAction}
                                recoveryReplay={vm.recoveryReplay}
                                summary={vm.summary}
                                errorMessage={vm.errorMessage}
                                actionOverrideJson={vm.actionOverrideJson}
                                setActionOverrideJson={vm.setActionOverrideJson}
                                actionOverrideError={vm.actionOverrideError}
                                setActionOverrideError={vm.setActionOverrideError}
                                overrideIsPending={vm.overrideActionMutation.isPending}
                                onQueueOverride={vm.handleQueueActionOverride}
                            />
                        )}

                        {vm.rightRailTab === 'execution' && vm.workspaceTab === 'checkpoints' && (
                            <RunCheckpointsView
                                isLoading={vm.checkpointsQuery.isLoading}
                                isError={vm.checkpointsQuery.isError}
                                checkpointRecords={vm.checkpointRecords}
                            />
                        )}

                        {vm.rightRailTab === 'execution' && vm.workspaceTab === 'timeline' && (
                            <RunTimelineView
                                statusLabel={vm.status}
                                actionTypes={vm.history.map(action => action.type)}
                                checkpoints={vm.checkpointRecords}
                                recoveryReplay={vm.recoveryReplay}
                                replanningEvents={vm.replanningEvents}
                            />
                        )}

                        {vm.rightRailTab === 'safety' && (
                            <RunSafetyView
                                isLoading={vm.readinessQuery.isLoading}
                                isError={vm.readinessQuery.isError}
                                readinessSummary={vm.readinessSummary}
                                readinessMessage={vm.readinessData?.message}
                                policyFlags={vm.policyFlags}
                                recentPolicyEvents={vm.recentPolicyEvents}
                            />
                        )}
                    </div>
                </div>

                <RunActivityLog
                    status={vm.status}
                    currentAction={vm.currentAction}
                    history={vm.history}
                    success={vm.success}
                    summary={vm.summary}
                    errorMessage={vm.errorMessage}
                    runId={vm.runId}
                    cancelIsPending={vm.cancelMutation.isPending}
                    onCancel={() => vm.cancelMutation.mutate()}
                    onInspect={vm.handleOpenInspect}
                />
            </div>
        </div>
    );
}
