import React, { useEffect, useMemo, useState } from 'react';
import { trpc } from '../trpc';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';
import type { WorkflowEvent } from '@domain/events';
import { PlatformSelector } from './PlatformSelector';
import { platformRegistry, type PlatformFieldValue } from '../config/platformRegistry';
import type { BuiltInPlatformType, PlatformConfig, WebPlatformConfig, ElectronPlatformConfig } from '../../domain/types/PlatformConfig';
import {
    appendStepToList,
    type EditableWorkflowStep,
    moveItem,
    normalizeSteps,
    removeStepById,
    updateStepById
} from './WorkflowWorkspace.helpers';

interface WorkflowEventView {
    readonly id: string;
    readonly label: string;
}

export function WorkflowWorkspace(): React.ReactElement {
    const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');
    const [selectedRunId, setSelectedRunId] = useState<string>('');
    const [workflowName, setWorkflowName] = useState('Smoke Workflow');
    const [workflowDescription, setWorkflowDescription] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<BuiltInPlatformType>('web');
    const [platformData, setPlatformData] = useState<PlatformFieldValue>(platformRegistry.web.defaultValues);
    const [steps, setSteps] = useState<Array<EditableWorkflowStep>>([
        {
            id: 'new-step-1',
            name: 'Primary Validation',
            prompt: 'verify that brahim is smiling',
            continueOnFailure: false
        }
    ]);
    const [eventFeed, setEventFeed] = useState<WorkflowEventView[]>([]);
    const [activeTab, setActiveTab] = useState<'definitions' | 'runs'>('definitions');
    const [selectedChildRunId, setSelectedChildRunId] = useState<string>('');

    const definitionsQuery = trpc.workflow.getDefinitions.useQuery({ limit: 30 });
    const runsQuery = trpc.workflow.getRuns.useQuery({ limit: 30 });

    const createMutation = trpc.workflow.create.useMutation({
        onSuccess: ({ id }) => {
            setSelectedDefinitionId(id);
            void definitionsQuery.refetch();
        }
    });

    const updateMutation = trpc.workflow.update.useMutation({
        onSuccess: () => {
            void definitionsQuery.refetch();
        }
    });

    const publishMutation = trpc.workflow.publish.useMutation({
        onSuccess: () => {
            void definitionsQuery.refetch();
        }
    });

    const nextVersionMutation = trpc.workflow.createNextVersion.useMutation({
        onSuccess: (definition) => {
            setSelectedDefinitionId(definition.id);
            void definitionsQuery.refetch();
        }
    });

    const startMutation = trpc.workflow.start.useMutation({
        onSuccess: () => {
            void runsQuery.refetch();
        }
    });

    const cancelMutation = trpc.workflow.cancel.useMutation();

    trpc.workflow.onUpdate.useSubscription(undefined, {
        onData: (event) => {
            const typedEvent = event as WorkflowEvent;
            const line = renderEventLabel(typedEvent);
            setEventFeed((current) => [{ id: `${Date.now()}-${Math.random()}`, label: line }, ...current].slice(0, 50));
            void runsQuery.refetch();
        },
        onError: (error) => {
            setEventFeed((current) => [{ id: `${Date.now()}-error`, label: `workflow_failed: ${error.message}` }, ...current].slice(0, 50));
        },
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window
    });

    const definitions = definitionsQuery.data ?? [];
    const runs = runsQuery.data ?? [];

    const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);
    const runDetailsQuery = trpc.workflow.getRunDetails.useQuery(
        { workflowRunId: selectedRunId },
        { enabled: Boolean(selectedRunId) }
    );
    const childCheckpointsQuery = trpc.test.getCheckpoints.useQuery(
        { runId: selectedChildRunId },
        { enabled: Boolean(selectedChildRunId) }
    );
    const childRunDetailsQuery = trpc.history.getRun.useQuery(
        { id: selectedChildRunId },
        { enabled: Boolean(selectedChildRunId) }
    );

    const selectedDefinition = useMemo(
        () => definitions.find((definition) => definition.id === selectedDefinitionId) ?? null,
        [definitions, selectedDefinitionId]
    );

    const appendStep = (): void => setSteps((current) => appendStepToList(current));
    const moveStep = (index: number, delta: number): void => setSteps((current) => moveItem(current, index, delta));
    const updateStep = (stepId: string, updates: Partial<EditableWorkflowStep>): void => setSteps((current) => updateStepById(current, stepId, updates));
    const removeStep = (stepId: string): void => setSteps((current) => removeStepById(current, stepId));

    const buildPlatformConfig = (
        platform: BuiltInPlatformType,
        fieldValue: PlatformFieldValue
    ): PlatformConfig => {
        switch (platform) {
            case 'web': {
                const webFields = fieldValue as Omit<WebPlatformConfig, 'platform'>;
                return {
                    platform: 'web',
                    url: webFields.url
                };
            }
            case 'electron': {
                const electronFields = fieldValue as Omit<ElectronPlatformConfig, 'platform'>;
                return {
                    platform: 'electron',
                    connection: electronFields.connection
                };
            }
            default: {
                const exhaustive: never = platform;
                throw new Error(`Unsupported workflow platform: ${String(exhaustive)}`);
            }
        }
    };

    useEffect(() => {
        if (!selectedDefinition) {
            return;
        }

        setWorkflowName(selectedDefinition.name);
        setWorkflowDescription(selectedDefinition.description ?? '');
        setSelectedPlatform(selectedDefinition.platformConfig.platform as BuiltInPlatformType);
        if (selectedDefinition.platformConfig.platform === 'web') {
            setPlatformData({ url: selectedDefinition.platformConfig.url });
        } else {
            setPlatformData({ connection: selectedDefinition.platformConfig.connection });
        }
        setSteps(
            selectedDefinition.steps.map((step) => ({
                id: step.id,
                name: step.name,
                prompt: step.prompt,
                continueOnFailure: step.continueOnFailure
            }))
        );
    }, [selectedDefinition]);

    const onCreateDefinition = (): void => {
        const name = workflowName.trim();
        const normalizedSteps = normalizeSteps(steps);
        const platformConfig = buildPlatformConfig(selectedPlatform, platformData);

        if (!name || normalizedSteps.length === 0) {
            return;
        }

        createMutation.mutate({
            name,
            ...(workflowDescription.trim() ? { description: workflowDescription.trim() } : {}),
            platformConfig,
            steps: normalizedSteps
        });
    };

    const onUpdateDefinition = (): void => {
        if (!selectedDefinition || selectedDefinition.status !== 'draft') {
            return;
        }

        const normalizedSteps = normalizeSteps(steps);
        if (!workflowName.trim() || normalizedSteps.length === 0) {
            return;
        }

        updateMutation.mutate({
            id: selectedDefinition.id,
            name: workflowName.trim(),
            ...(workflowDescription.trim() ? { description: workflowDescription.trim() } : {}),
            platformConfig: buildPlatformConfig(selectedPlatform, platformData),
            steps: normalizedSteps.map((step) => ({
                id: step.id,
                name: step.name,
                prompt: step.prompt,
                continueOnFailure: step.continueOnFailure
            }))
        });
    };

    const onPublishDefinition = (): void => {
        if (!selectedDefinitionId) {
            return;
        }
        publishMutation.mutate({ workflowDefinitionId: selectedDefinitionId });
    };

    const onCreateNextVersion = (): void => {
        if (!selectedDefinitionId) {
            return;
        }
        nextVersionMutation.mutate({ sourceWorkflowDefinitionId: selectedDefinitionId });
    };

    const onStartWorkflow = (): void => {
        if (!selectedDefinitionId) {
            return;
        }
        startMutation.mutate({ workflowDefinitionId: selectedDefinitionId });
    };

    return (
        <section className="h-full w-full p-6 bg-gray-50 overflow-auto">
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <h2 className="text-xl font-semibold tracking-tight text-gray-900">Workflow Workspace</h2>
                        <SegmentedControl
                            items={[
                                { value: 'definitions', label: 'Definitions' },
                                { value: 'runs', label: 'Runs' }
                            ] as const}
                            value={activeTab}
                            onChange={setActiveTab}
                            className="rounded-lg"
                            itemClassName="px-3 py-1.5 text-xs"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            value={workflowName}
                            onChange={(event) => setWorkflowName(event.target.value)}
                            placeholder="Workflow name"
                            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onCreateDefinition}
                            disabled={createMutation.isPending}
                            isLoading={createMutation.isPending}
                        >
                            Create Workflow
                        </Button>
                    </div>

                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <PlatformSelector
                            value={selectedPlatform}
                            onChange={(platform) => {
                                setSelectedPlatform(platform);
                                setPlatformData(platformRegistry[platform].defaultValues);
                            }}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        />

                        <div className="mt-2">
                            {React.createElement(platformRegistry[selectedPlatform].renderFields, {
                                value: platformData,
                                onChange: setPlatformData,
                                errors: {},
                                disabled: createMutation.isPending || updateMutation.isPending
                            })}
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onUpdateDefinition}
                            disabled={!selectedDefinition || selectedDefinition.status !== 'draft' || updateMutation.isPending}
                            isLoading={updateMutation.isPending}
                        >
                            Save Draft
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onPublishDefinition}
                            disabled={!selectedDefinition || selectedDefinition.status !== 'draft' || publishMutation.isPending}
                            isLoading={publishMutation.isPending}
                        >
                            Publish
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCreateNextVersion}
                            disabled={!selectedDefinition || nextVersionMutation.isPending}
                            isLoading={nextVersionMutation.isPending}
                        >
                            Next Version
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={appendStep}
                        >
                            Add Step
                        </Button>
                    </div>

                    <input
                        value={workflowDescription}
                        onChange={(event) => setWorkflowDescription(event.target.value)}
                        placeholder="Description"
                        className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    />

                    <div className="mt-3 space-y-3 max-h-80 overflow-auto">
                        {steps.map((step, index) => (
                            <div key={step.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-semibold text-gray-500 uppercase">Step {index + 1}</div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => moveStep(index, -1)} disabled={index === 0}>↑</Button>
                                        <Button variant="ghost" size="sm" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}>↓</Button>
                                        <Button variant="ghost" size="sm" onClick={() => removeStep(step.id)} disabled={steps.length <= 1}>Remove</Button>
                                    </div>
                                </div>

                                <input
                                    value={step.name}
                                    onChange={(event) => updateStep(step.id, { name: event.target.value })}
                                    placeholder="Step name"
                                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                                />
                                <textarea
                                    value={step.prompt}
                                    onChange={(event) => updateStep(step.id, { prompt: event.target.value })}
                                    placeholder="Step prompt"
                                    className="mt-2 w-full h-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                                />
                                <label className="mt-2 flex items-center justify-between text-xs text-gray-700">
                                    <span>Continue on Failure</span>
                                    <input
                                        type="checkbox"
                                        checked={step.continueOnFailure}
                                        onChange={(event) => updateStep(step.id, { continueOnFailure: event.target.checked })}
                                    />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-800">
                                {activeTab === 'definitions' ? 'Workflow Definitions' : 'Workflow Runs'}
                            </h3>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={onStartWorkflow}
                                disabled={!selectedDefinitionId || startMutation.isPending}
                                isLoading={startMutation.isPending}
                            >
                                Start Selected
                            </Button>
                        </div>

                        {activeTab === 'definitions' ? (
                            <div className="space-y-2 max-h-80 overflow-auto">
                                {definitions.map((definition) => (
                                    <button
                                        key={definition.id}
                                        onClick={() => setSelectedDefinitionId(definition.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                                            selectedDefinitionId === definition.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="text-sm font-medium text-gray-900">{definition.name}</div>
                                        <div className="text-xs text-gray-500">v{definition.version} • {definition.status}</div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-80 overflow-auto">
                                {runs.map((run) => (
                                    <button
                                        key={run.id}
                                        onClick={() => setSelectedRunId(run.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                                            selectedRunId === run.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="text-sm font-medium text-gray-900">{run.id}</div>
                                        <div className="text-xs text-gray-500">{run.status} • {run.startedAt}</div>
                                        {run.summary ? <div className="text-xs text-gray-700 mt-1">{run.summary}</div> : null}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-800">Live Workflow Events</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelMutation.mutate()}
                                disabled={cancelMutation.isPending}
                            >
                                Stop Running
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-96 overflow-auto font-mono text-xs">
                            {eventFeed.length === 0 ? (
                                <div className="text-gray-400">No events yet.</div>
                            ) : (
                                eventFeed.map((event) => (
                                    <div key={event.id} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                                        {event.label}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

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
                                    {stepRun.testRunId ? (
                                        <button
                                            onClick={() => setSelectedChildRunId(stepRun.testRunId as string)}
                                            className="text-[11px] text-blue-600 mt-0.5 hover:underline"
                                        >
                                            Test Run: {stepRun.testRunId}
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
            </div>
        </section>
    );
}

function toArtifactHref(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://')) {
        return path;
    }

    return `file://${path}`;
}

function renderEventLabel(event: WorkflowEvent): string {
    switch (event.type) {
        case 'workflow_started':
            return `workflow_started: ${event.workflowRunId}`;
        case 'workflow_step_started':
            return `workflow_step_started: #${event.stepIndex + 1} (${event.stepId})`;
        case 'workflow_step_bound':
            return `workflow_step_bound: #${event.stepIndex + 1} -> ${event.testRunId}`;
        case 'workflow_step_completed':
            return `workflow_step_completed: #${event.stepIndex + 1} (${event.success ? 'success' : 'failed'})`;
        case 'workflow_completed':
            return `workflow_completed: ${event.workflowRunId} (${event.success ? 'success' : 'failed'})`;
        case 'workflow_failed':
            return `workflow_failed: ${event.reason}`;
    }
}
