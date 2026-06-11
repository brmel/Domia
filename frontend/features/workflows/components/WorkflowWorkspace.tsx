import React, { useState } from 'react';
import { Button } from '@frontend/ui/Button';
import { SegmentedControl } from '@frontend/ui/SegmentedControl';
import { PlatformSelector } from '@frontend/features/runs/components/platform/PlatformSelector';
import { platformRegistry } from '@frontend/lib/platformRegistry';
import { useWorkflowEditor } from '../hooks/useWorkflowEditor';
import { useWorkflowRuns } from '../hooks/useWorkflowRuns';
import { useWorkflowDefinitions } from '../hooks/useWorkflowDefinitions';
import { useWorkflowEventFeed } from '../hooks/useWorkflowEventFeed';
import { WorkflowStepList } from './WorkflowStepList';
import { WorkflowRunDrilldown } from './WorkflowRunDrilldown';

export function WorkflowWorkspace(): React.ReactElement {
    const editor = useWorkflowEditor();
    const workflowRuns = useWorkflowRuns();
    const workflowDefs = useWorkflowDefinitions(editor, workflowRuns.startWorkflow);
    const eventFeed = useWorkflowEventFeed(workflowRuns.refetchRuns);
    const [activeTab, setActiveTab] = useState<'definitions' | 'runs'>('definitions');

    const editingBusy = workflowDefs.createMutation.isPending || workflowDefs.updateMutation.isPending;
    const startBusy = workflowRuns.startMutation.isPending || workflowDefs.createMutation.isPending;

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
                            value={editor.workflowName}
                            onChange={(event) => editor.setWorkflowName(event.target.value)}
                            placeholder="Workflow name"
                            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={workflowDefs.createDefinition}
                            disabled={workflowDefs.createMutation.isPending}
                            isLoading={workflowDefs.createMutation.isPending}
                        >
                            Create Workflow
                        </Button>
                    </div>

                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <PlatformSelector
                            value={editor.selectedPlatform}
                            onChange={(platform) => {
                                editor.setSelectedPlatform(platform);
                                editor.setPlatformData(platformRegistry[platform].defaultValues);
                            }}
                            disabled={editingBusy}
                        />

                        <div className="mt-2">
                            {React.createElement(platformRegistry[editor.selectedPlatform].renderFields, {
                                value: editor.platformData,
                                onChange: editor.setPlatformData,
                                errors: {},
                                disabled: editingBusy
                            })}
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={workflowDefs.selectedDefinitionId ? workflowDefs.startSelected : workflowDefs.createAndStart}
                            disabled={startBusy}
                            isLoading={startBusy}
                        >
                            {workflowDefs.selectedDefinitionId ? 'Run Selected' : 'Run'}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={workflowDefs.updateDefinition}
                            disabled={!workflowDefs.selectedDefinition || workflowDefs.selectedDefinition.status !== 'draft' || workflowDefs.updateMutation.isPending}
                            isLoading={workflowDefs.updateMutation.isPending}
                        >
                            Save Draft
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={workflowDefs.publishDefinition}
                            disabled={!workflowDefs.selectedDefinition || workflowDefs.selectedDefinition.status !== 'draft' || workflowDefs.publishMutation.isPending}
                            isLoading={workflowDefs.publishMutation.isPending}
                        >
                            Publish
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={workflowDefs.createNextVersion}
                            disabled={!workflowDefs.selectedDefinition || workflowDefs.nextVersionMutation.isPending}
                            isLoading={workflowDefs.nextVersionMutation.isPending}
                        >
                            Next Version
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={editor.appendStep}
                        >
                            Add Step
                        </Button>
                    </div>

                    <input
                        value={editor.workflowDescription}
                        onChange={(event) => editor.setWorkflowDescription(event.target.value)}
                        placeholder="Description"
                        className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    />

                    <WorkflowStepList
                        steps={editor.steps}
                        moveStep={editor.moveStep}
                        updateStep={editor.updateStep}
                        removeStep={editor.removeStep}
                    />
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
                                onClick={workflowDefs.startSelected}
                                disabled={!workflowDefs.selectedDefinitionId || workflowRuns.startMutation.isPending}
                                isLoading={workflowRuns.startMutation.isPending}
                            >
                                Start Selected
                            </Button>
                        </div>

                        {activeTab === 'definitions' ? (
                            <div className="space-y-2 max-h-80 overflow-auto">
                                {workflowDefs.definitions.map((definition) => (
                                    <button
                                        key={definition.id}
                                        onClick={() => workflowDefs.setSelectedDefinitionId(definition.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                                            workflowDefs.selectedDefinitionId === definition.id
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
                                {workflowRuns.runs.map((run) => (
                                    <button
                                        key={run.id}
                                        onClick={() => workflowRuns.setSelectedRunId(run.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                                            workflowRuns.selectedRunId === run.id
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
                                onClick={() => workflowRuns.cancelMutation.mutate()}
                                disabled={workflowRuns.cancelMutation.isPending}
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
                    selectedDefinition={workflowDefs.selectedDefinition}
                    selectedRunId={workflowRuns.selectedRunId}
                    selectedChildRunId={workflowRuns.selectedChildRunId}
                    onSelectChildRun={workflowRuns.setSelectedChildRunId}
                />
            </div>
        </section>
    );
}
