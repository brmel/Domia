import React from 'react';
import type { useWorkflowWorkspace } from './useWorkflowWorkspace';
import { toArtifactHref } from './useWorkflowWorkspace';

type WS = ReturnType<typeof useWorkflowWorkspace>;

interface WorkflowRunDrilldownProps {
    selectedDefinition: WS['selectedDefinition'];
    selectedRun: WS['selectedRun'];
    runDetailsQuery: WS['runDetailsQuery'];
    selectedChildRunId: WS['selectedChildRunId'];
    setSelectedChildRunId: WS['setSelectedChildRunId'];
    childCheckpointsQuery: WS['childCheckpointsQuery'];
    childRunDetailsQuery: WS['childRunDetailsQuery'];
}

/** Read-only drilldown panels: selected definition, run step-runs, and a child run's
 *  checkpoints + artifacts. Each panel renders only when its selection is present. */
export function WorkflowRunDrilldown({
    selectedDefinition, selectedRun, runDetailsQuery,
    selectedChildRunId, setSelectedChildRunId, childCheckpointsQuery, childRunDetailsQuery,
}: WorkflowRunDrilldownProps): React.ReactElement {
    return (
        <>
            {selectedDefinition ? (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Selected Definition</h3>
                    <div className="text-sm text-gray-700">{selectedDefinition.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{selectedDefinition.steps.length} step(s)</div>
                </div>
            ) : null}

            {selectedRun && runDetailsQuery.data ? (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Run Drilldown</h3>
                    <div className="text-xs text-gray-500 mb-3">{selectedRun.id}</div>
                    <div className="space-y-2">
                        {runDetailsQuery.data.stepRuns.map((stepRun) => (
                            <div key={stepRun.id} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2">
                                <div className="text-xs font-semibold text-gray-700">
                                    Step {stepRun.stepIndex + 1} • {stepRun.status}
                                </div>
                                {stepRun.runId ? (
                                    <button
                                        onClick={() => setSelectedChildRunId(stepRun.runId as string)}
                                        className="text-[11px] text-blue-600 mt-0.5 hover:underline"
                                    >
                                        Run: {stepRun.runId}
                                    </button>
                                ) : null}
                                {stepRun.summary ? (
                                    <div className="text-[11px] text-gray-600 mt-1">{stepRun.summary}</div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {selectedChildRunId ? (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Child Run Checkpoints</h3>
                    <div className="text-xs text-gray-500 mb-2">{selectedChildRunId}</div>
                    <div className="space-y-1 max-h-56 overflow-auto">
                        {(childCheckpointsQuery.data ?? []).map((checkpoint, index) => (
                            <div key={`${checkpoint.createdAt}-${index}`} className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
                                <div className="text-[11px] text-gray-700 font-medium">{checkpoint.reason}</div>
                                <div className="text-[10px] text-gray-500">Step {checkpoint.state.stepNumber} • {checkpoint.createdAt}</div>
                            </div>
                        ))}
                        {!childCheckpointsQuery.isLoading && (childCheckpointsQuery.data ?? []).length === 0 ? (
                            <div className="text-xs text-gray-400">No checkpoints found.</div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {selectedChildRunId ? (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Child Run Artifacts</h3>
                    <div className="text-xs text-gray-500 mb-2">{selectedChildRunId}</div>
                    <div className="space-y-2 max-h-64 overflow-auto">
                        {(childRunDetailsQuery.data?.steps ?? []).map((step) => {
                            const artifactEntries = Object.entries(step.assets ?? {});
                            return (
                                <div key={step.id} className="rounded border border-gray-200 bg-gray-50 px-2 py-2">
                                    <div className="text-[11px] font-medium text-gray-700 mb-1">Step {step.stepNumber}</div>
                                    {artifactEntries.length > 0 ? (
                                        <div className="space-y-1">
                                            {artifactEntries.map(([key, path]) => (
                                                <a
                                                    key={`${step.id}-${key}`}
                                                    href={toArtifactHref(path)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block text-[11px] text-blue-600 hover:underline break-all"
                                                >
                                                    {key}: {path}
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-gray-400">No artifacts recorded for this step.</div>
                                    )}
                                </div>
                            );
                        })}
                        {!childRunDetailsQuery.isLoading && (childRunDetailsQuery.data?.steps ?? []).length === 0 ? (
                            <div className="text-xs text-gray-400">No step artifacts found.</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}
