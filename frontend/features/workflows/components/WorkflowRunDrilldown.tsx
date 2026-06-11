import React from 'react';
import { trpc } from '@frontend/api/trpc';
import { toArtifactHref } from './WorkflowWorkspace.helpers';

interface DefinitionSummary {
    readonly name: string;
    readonly steps: ReadonlyArray<unknown>;
}

interface WorkflowRunDrilldownProps {
    selectedDefinition: DefinitionSummary | null;
    selectedRunId: string;
    selectedChildRunId: string;
    onSelectChildRun: (runId: string) => void;
}

function SelectedDefinitionPanel({ definition }: { definition: DefinitionSummary }): React.ReactElement {
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Selected Definition</h3>
            <div className="text-sm text-gray-700">{definition.name}</div>
            <div className="text-xs text-gray-500 mt-1">{definition.steps.length} step(s)</div>
        </div>
    );
}

function RunStepRunsPanel({ runId, onSelectChildRun }: { runId: string; onSelectChildRun: (runId: string) => void }): React.ReactElement | null {
    const runDetailsQuery = trpc.workflow.getRunDetails.useQuery({ workflowRunId: runId });
    if (!runDetailsQuery.data) return null;

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Run Drilldown</h3>
            <div className="text-xs text-gray-500 mb-3">{runId}</div>
            <div className="space-y-2">
                {runDetailsQuery.data.stepRuns.map((stepRun) => (
                    <div key={stepRun.id} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2">
                        <div className="text-xs font-semibold text-gray-700">
                            Step {stepRun.stepIndex + 1} • {stepRun.status}
                        </div>
                        {stepRun.runId ? (
                            <button
                                onClick={() => onSelectChildRun(stepRun.runId as string)}
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
    );
}

function ChildRunCheckpointsPanel({ runId }: { runId: string }): React.ReactElement {
    const checkpointsQuery = trpc.run.getCheckpoints.useQuery({ runId });
    const checkpoints = checkpointsQuery.data ?? [];

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Child Run Checkpoints</h3>
            <div className="text-xs text-gray-500 mb-2">{runId}</div>
            <div className="space-y-1 max-h-56 overflow-auto">
                {checkpoints.map((checkpoint, index) => (
                    <div key={`${checkpoint.createdAt}-${index}`} className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
                        <div className="text-[11px] text-gray-700 font-medium">{checkpoint.reason}</div>
                        <div className="text-[10px] text-gray-500">Step {checkpoint.state.stepNumber} • {checkpoint.createdAt}</div>
                    </div>
                ))}
                {!checkpointsQuery.isLoading && checkpoints.length === 0 ? (
                    <div className="text-xs text-gray-400">No checkpoints found.</div>
                ) : null}
            </div>
        </div>
    );
}

function ChildRunArtifactsPanel({ runId }: { runId: string }): React.ReactElement {
    const runDetailsQuery = trpc.history.getRun.useQuery({ id: runId });
    const steps = runDetailsQuery.data?.steps ?? [];

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Child Run Artifacts</h3>
            <div className="text-xs text-gray-500 mb-2">{runId}</div>
            <div className="space-y-2 max-h-64 overflow-auto">
                {steps.map((step) => {
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
                {!runDetailsQuery.isLoading && steps.length === 0 ? (
                    <div className="text-xs text-gray-400">No step artifacts found.</div>
                ) : null}
            </div>
        </div>
    );
}

export function WorkflowRunDrilldown({
    selectedDefinition, selectedRunId, selectedChildRunId, onSelectChildRun,
}: WorkflowRunDrilldownProps): React.ReactElement {
    return (
        <>
            {selectedDefinition ? <SelectedDefinitionPanel definition={selectedDefinition} /> : null}
            {selectedRunId ? <RunStepRunsPanel runId={selectedRunId} onSelectChildRun={onSelectChildRun} /> : null}
            {selectedChildRunId ? <ChildRunCheckpointsPanel runId={selectedChildRunId} /> : null}
            {selectedChildRunId ? <ChildRunArtifactsPanel runId={selectedChildRunId} /> : null}
        </>
    );
}
