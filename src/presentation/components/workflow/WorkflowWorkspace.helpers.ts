export interface EditableWorkflowStep {
    readonly id: string;
    readonly name: string;
    readonly prompt: string;
    readonly continueOnFailure: boolean;
}

export function normalizeSteps(steps: ReadonlyArray<EditableWorkflowStep>): Array<{
    id?: string;
    name: string;
    prompt: string;
    continueOnFailure: boolean;
}> {
    return steps
        .map((step) => ({
            ...(step.id.startsWith('new-step-') ? {} : { id: step.id }),
            name: step.name.trim(),
            prompt: step.prompt.trim(),
            continueOnFailure: step.continueOnFailure
        }))
        .filter((step) => step.name.length > 0 && step.prompt.length > 0);
}

export function moveItem<T>(items: ReadonlyArray<T>, index: number, delta: number): T[] {
    const target = index + delta;
    if (target < 0 || target >= items.length) {
        return [...items];
    }

    const next = [...items];
    const current = next[index];
    if (!current) {
        return next;
    }
    const swap = next[target];
    if (!swap) {
        return next;
    }
    next[index] = swap;
    next[target] = current;
    return next;
}

export function updateStepById(
    steps: ReadonlyArray<EditableWorkflowStep>,
    stepId: string,
    updates: Partial<EditableWorkflowStep>
): EditableWorkflowStep[] {
    return steps.map((step) => (step.id === stepId ? { ...step, ...updates } : step));
}

export function removeStepById(steps: ReadonlyArray<EditableWorkflowStep>, stepId: string): EditableWorkflowStep[] {
    const next = steps.filter((step) => step.id !== stepId);
    return next.length > 0 ? next : [...steps];
}

export function appendStepToList(steps: ReadonlyArray<EditableWorkflowStep>): EditableWorkflowStep[] {
    return [
        ...steps,
        {
            id: createStepId(),
            name: `Step ${steps.length + 1}`,
            prompt: '',
            continueOnFailure: false
        }
    ];
}

function createStepId(): string {
    return `new-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
