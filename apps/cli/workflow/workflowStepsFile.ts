import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface WorkflowStepFileRecord {
    id?: string;
    kind?: 'agent' | 'foreach';
    name: string;
    prompt?: string;
    items?: string[];
    bodyPrompt?: string;
    continueOnFailure?: boolean;
    options?: Record<string, unknown>;
}

export function stepRecordToInput(step: WorkflowStepFileRecord): Record<string, unknown> {
    const continueOnFailure = step.continueOnFailure ?? false;
    const optionsBlock = step.options ? { options: step.options } : {};
    const idBlock = step.id ? { id: step.id } : {};
    if (step.kind === 'foreach') {
        return {
            kind: 'foreach',
            ...idBlock,
            name: step.name,
            items: step.items ?? [],
            bodyPrompt: step.bodyPrompt ?? '',
            continueOnFailure,
            ...optionsBlock,
        };
    }
    return {
        kind: 'agent',
        ...idBlock,
        name: step.name,
        prompt: step.prompt ?? '',
        continueOnFailure,
        ...optionsBlock,
    };
}

export function readStepsFile(filePath: string, allowStepIds: boolean): WorkflowStepFileRecord[] {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = readFileSync(absolutePath, 'utf8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
        throw new Error('Steps file must be a JSON array.');
    }

    const steps = parsed.map((record) => {
        if (!record || typeof record !== 'object') {
            throw new Error('Each step must be an object.');
        }

        const value = record as WorkflowStepFileRecord;
        if (!allowStepIds && value.id !== undefined) {
            throw new Error('Step id is not allowed when creating a workflow.');
        }

        return value;
    });

    if (steps.length === 0) {
        throw new Error('Steps file must contain at least one step.');
    }

    return steps;
}
