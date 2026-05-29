import React from 'react';
import { Button } from '@frontend/ui/Button';
import { SegmentedControl } from '@frontend/ui/SegmentedControl';
import { PlatformSelector } from '@frontend/features/runs/components/platform/PlatformSelector';
import { platformRegistry } from '@frontend/lib/platformRegistry';
import { useWorkflowWorkspace } from './useWorkflowWorkspace';
import { WorkflowStepList } from './WorkflowStepList';
import { WorkflowRunDrilldown } from './WorkflowRunDrilldown';

export function WorkflowWorkspace(): React.ReactElement {
    const {
        selectedDefinitionId, setSelectedDefinitionId,
        selectedRunId, setSelectedRunId,
        workflowName, setWorkflowName,
        workflowDescription, setWorkflowDescription,
        selectedPlatform, setSelectedPlatform,
        platformData, setPlatformData,
        steps,
        eventFeed,
        activeTab, setActiveTab,
        selectedChildRunId, setSelectedChildRunId,
        definitions, runs,
        selectedDefinition, selectedRun,
        runDetailsQuery, childCheckpointsQuery, childRunDetailsQuery,
        createMutation, updateMutation, publishMutation, nextVersionMutation, startMutation, cancelMutation,
        appendStep, moveStep, updateStep, removeStep,
        onCreateDefinition, onUpdateDefinition, onPublishDefinition, onCreateNextVersion, onStartWorkflow, onCreateAndStart,
    } = useWorkflowWorkspace();

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

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={selectedDefinitionId ? onStartWorkflow : onCreateAndStart}
                            disabled={startMutation.isPending || createMutation.isPending}
                            isLoading={startMutation.isPending || createMutation.isPending}
                        >
                            {selectedDefinitionId ? 'Run Selected' : 'Run'}
                        </Button>
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

                    <WorkflowStepList steps={steps} moveStep={moveStep} updateStep={updateStep} removeStep={removeStep} />
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

                <WorkflowRunDrilldown
                    selectedDefinition={selectedDefinition}
                    selectedRun={selectedRun}
                    runDetailsQuery={runDetailsQuery}
                    selectedChildRunId={selectedChildRunId}
                    setSelectedChildRunId={setSelectedChildRunId}
                    childCheckpointsQuery={childCheckpointsQuery}
                    childRunDetailsQuery={childRunDetailsQuery}
                />
            </div>
        </section>
    );
}
