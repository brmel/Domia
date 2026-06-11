import { useCallback, useState } from 'react';
import { platformRegistry, type PlatformFieldValue, type UIPlatformType } from '@frontend/lib/platformRegistry';
import { buildPlatformConfig } from '@frontend/lib/buildPlatformConfig';
import {
    appendStepToList,
    type EditableWorkflowStep,
    moveItem,
    normalizeSteps,
    removeStepById,
    updateStepById
} from '../components/WorkflowWorkspace.helpers';

export interface WorkflowDefinitionSnapshot {
    readonly name: string;
    readonly description?: string | undefined;
    readonly platformConfig: {
        readonly platform: string;
        readonly url?: string;
        readonly connection?: unknown;
    };
    readonly steps: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly continueOnFailure: boolean;
        readonly kind?: string;
        readonly prompt?: string;
        readonly bodyPrompt?: string;
    }>;
}

export interface WorkflowDraft {
    readonly name: string;
    readonly description?: string;
    readonly platformConfig: ReturnType<typeof buildPlatformConfig>;
    readonly steps: ReturnType<typeof normalizeSteps>;
}

export function useWorkflowEditor() {
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

    const appendStep = (): void => setSteps((current) => appendStepToList(current));
    const moveStep = (index: number, delta: number): void => setSteps((current) => moveItem(current, index, delta));
    const updateStep = (stepId: string, updates: Partial<EditableWorkflowStep>): void => setSteps((current) => updateStepById(current, stepId, updates));
    const removeStep = (stepId: string): void => setSteps((current) => removeStepById(current, stepId));

    const hydrate = useCallback((definition: WorkflowDefinitionSnapshot): void => {
        setWorkflowName(definition.name);
        setWorkflowDescription(definition.description ?? '');
        setSelectedPlatform(definition.platformConfig.platform as UIPlatformType);
        if (definition.platformConfig.platform === 'web' && definition.platformConfig.url !== undefined) {
            setPlatformData({ url: definition.platformConfig.url });
        } else if (definition.platformConfig.platform === 'electron' && definition.platformConfig.connection !== undefined) {
            setPlatformData({ connection: definition.platformConfig.connection } as PlatformFieldValue);
        }
        setSteps(
            definition.steps.map((step) => ({
                id: step.id,
                name: step.name,
                prompt: (step.kind === 'foreach' ? step.bodyPrompt : step.prompt) ?? '',
                continueOnFailure: step.continueOnFailure
            }))
        );
    }, []);

    const buildDraft = useCallback((): WorkflowDraft | null => {
        const name = workflowName.trim();
        const normalizedSteps = normalizeSteps(steps);
        if (!name || normalizedSteps.length === 0) return null;
        return {
            name,
            ...(workflowDescription.trim() ? { description: workflowDescription.trim() } : {}),
            platformConfig: buildPlatformConfig(selectedPlatform, platformData),
            steps: normalizedSteps
        };
    }, [workflowName, workflowDescription, selectedPlatform, platformData, steps]);

    return {
        workflowName, setWorkflowName,
        workflowDescription, setWorkflowDescription,
        selectedPlatform, setSelectedPlatform,
        platformData, setPlatformData,
        steps, appendStep, moveStep, updateStep, removeStep,
        hydrate, buildDraft,
    };
}

export type WorkflowEditor = ReturnType<typeof useWorkflowEditor>;
