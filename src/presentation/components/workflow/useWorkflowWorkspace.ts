import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../../trpc';
import type { WorkflowEvent } from '@domain/WorkflowEvent';
import { platformRegistry, type PlatformFieldValue } from '../../config/platformRegistry';
import { buildPlatformConfig } from '../../utils/buildPlatformConfig';
import type { UIPlatformType } from '../../config/platformRegistry';
import {
    appendStepToList,
    type EditableWorkflowStep,
    moveItem,
    normalizeSteps,
    removeStepById,
    updateStepById
} from './WorkflowWorkspace.helpers';

export interface WorkflowEventView {
    readonly id: string;
    readonly label: string;
}

function renderEventLabel(event: WorkflowEvent): string {
    switch (event.type) {
        case 'workflow_started':
            return `workflow_started: ${event.workflowRunId}`;
        case 'workflow_step_started':
            return `workflow_step_started: #${event.stepIndex + 1} (${event.stepId})`;
        case 'workflow_step_bound':
            return `workflow_step_bound: #${event.stepIndex + 1} -> ${event.runId}`;
        case 'workflow_step_completed':
            return `workflow_step_completed: #${event.stepIndex + 1} (${event.success ? 'success' : 'failed'})`;
        case 'workflow_completed':
            return `workflow_completed: ${event.workflowRunId} (${event.success ? 'success' : 'failed'})`;
        case 'workflow_failed':
            return `workflow_failed: ${event.reason}`;
    }
}

export function toArtifactHref(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://')) {
        return path;
    }
    return `file://${path}`;
}

export function useWorkflowWorkspace() {
    const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');
    const [selectedRunId, setSelectedRunId] = useState<string>('');
    const [workflowName, setWorkflowName] = useState('Smoke Workflow');
    const [workflowDescription, setWorkflowDescription] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<UIPlatformType>('web');
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
        onSuccess: () => { void definitionsQuery.refetch(); }
    });

    const publishMutation = trpc.workflow.publish.useMutation({
        onSuccess: () => { void definitionsQuery.refetch(); }
    });

    const nextVersionMutation = trpc.workflow.createNextVersion.useMutation({
        onSuccess: (definition) => {
            setSelectedDefinitionId(definition.id);
            void definitionsQuery.refetch();
        }
    });

    const startMutation = trpc.workflow.start.useMutation({
        onSuccess: () => { void runsQuery.refetch(); }
    });

    const cancelMutation = trpc.workflow.cancel.useMutation();

    trpc.workflow.onUpdate.useSubscription(undefined, {
        onData: (event) => {
            // Forward live-view screenshots to the run store without polluting the event feed;
            // also skip the cancelled event (run-panel handles it via the run store)
            if ((event as { type: string }).type === 'screenshot' || (event as { type: string }).type === 'cancelled') {
                return;
            }
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
    const childCheckpointsQuery = trpc.run.getCheckpoints.useQuery(
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

    useEffect(() => {
        if (!selectedDefinition) return;

        setWorkflowName(selectedDefinition.name);
        setWorkflowDescription(selectedDefinition.description ?? '');
        setSelectedPlatform(selectedDefinition.platformConfig.platform as UIPlatformType);
        if (selectedDefinition.platformConfig.platform === 'web') {
            setPlatformData({ url: selectedDefinition.platformConfig.url });
        } else if (selectedDefinition.platformConfig.platform === 'electron') {
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
        if (!name || normalizedSteps.length === 0) return;

        createMutation.mutate({
            name,
            ...(workflowDescription.trim() ? { description: workflowDescription.trim() } : {}),
            platformConfig,
            steps: normalizedSteps
        });
    };

    const onUpdateDefinition = (): void => {
        if (!selectedDefinition || selectedDefinition.status !== 'draft') return;
        const normalizedSteps = normalizeSteps(steps);
        if (!workflowName.trim() || normalizedSteps.length === 0) return;

        updateMutation.mutate({
            id: selectedDefinition.id,
            name: workflowName.trim(),
            ...(workflowDescription.trim() ? { description: workflowDescription.trim() } : {}),
            platformConfig: buildPlatformConfig(selectedPlatform, platformData),
            steps: normalizedSteps.map((step) => ({
                id: step.id, name: step.name, prompt: step.prompt, continueOnFailure: step.continueOnFailure
            }))
        });
    };

    const onPublishDefinition = (): void => {
        if (!selectedDefinitionId) return;
        publishMutation.mutate({ workflowDefinitionId: selectedDefinitionId });
    };

    const onCreateNextVersion = (): void => {
        if (!selectedDefinitionId) return;
        nextVersionMutation.mutate({ sourceWorkflowDefinitionId: selectedDefinitionId });
    };

    const onStartWorkflow = (): void => {
        if (!selectedDefinitionId) return;
        startMutation.mutate({ workflowDefinitionId: selectedDefinitionId });
    };

    const onCreateAndStart = (): void => {
        const name = workflowName.trim();
        const normalizedSteps = normalizeSteps(steps);
        const platformConfig = buildPlatformConfig(selectedPlatform, platformData);
        if (!name || normalizedSteps.length === 0) return;

        createMutation.mutate(
            {
                name,
                ...(workflowDescription.trim() ? { description: workflowDescription.trim() } : {}),
                platformConfig,
                steps: normalizedSteps
            },
            {
                onSuccess: ({ id }) => {
                    startMutation.mutate({ workflowDefinitionId: id });
                }
            }
        );
    };

    return {
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
    };
}
