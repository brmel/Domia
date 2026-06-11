import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@frontend/api/trpc';
import type { WorkflowEditor } from './useWorkflowEditor';

export function useWorkflowDefinitions(editor: Pick<WorkflowEditor, 'hydrate' | 'buildDraft'>, onStart: (definitionId: string) => void) {
    const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');

    const definitionsQuery = trpc.workflow.getDefinitions.useQuery({ limit: 30 });
    const definitions = definitionsQuery.data ?? [];
    const selectedDefinition = useMemo(
        () => definitions.find((definition) => definition.id === selectedDefinitionId) ?? null,
        [definitions, selectedDefinitionId]
    );

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

    const { hydrate } = editor;
    useEffect(() => {
        if (selectedDefinition) hydrate(selectedDefinition);
    }, [selectedDefinition, hydrate]);

    const createDefinition = (): void => {
        const draft = editor.buildDraft();
        if (!draft) return;
        createMutation.mutate(draft);
    };

    const updateDefinition = (): void => {
        if (!selectedDefinition || selectedDefinition.status !== 'draft') return;
        const draft = editor.buildDraft();
        if (!draft) return;
        updateMutation.mutate({
            id: selectedDefinition.id,
            name: draft.name,
            ...(draft.description ? { description: draft.description } : {}),
            platformConfig: draft.platformConfig,
            steps: draft.steps.map((step) => ({
                id: step.id, name: step.name, prompt: step.prompt, continueOnFailure: step.continueOnFailure
            }))
        });
    };

    const publishDefinition = (): void => {
        if (!selectedDefinitionId) return;
        publishMutation.mutate({ workflowDefinitionId: selectedDefinitionId });
    };

    const createNextVersion = (): void => {
        if (!selectedDefinitionId) return;
        nextVersionMutation.mutate({ sourceWorkflowDefinitionId: selectedDefinitionId });
    };

    const startSelected = (): void => {
        if (!selectedDefinitionId) return;
        onStart(selectedDefinitionId);
    };

    const createAndStart = (): void => {
        const draft = editor.buildDraft();
        if (!draft) return;
        createMutation.mutate(draft, {
            onSuccess: ({ id }) => onStart(id)
        });
    };

    return {
        definitions, definitionsQuery,
        selectedDefinitionId, setSelectedDefinitionId,
        selectedDefinition,
        createMutation, updateMutation, publishMutation, nextVersionMutation,
        createDefinition, updateDefinition, publishDefinition, createNextVersion,
        startSelected, createAndStart,
    };
}

export type WorkflowDefinitions = ReturnType<typeof useWorkflowDefinitions>;
