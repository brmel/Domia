import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowDefinitionService } from '@backend/workflows/WorkflowDefinitionService';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
import type { ResultAsync } from 'neverthrow';

type InMemoryWorkflowPersistence = {
    saveWorkflowDefinition: (definition: WorkflowDefinition) => ResultAsync<void, never>;
    getWorkflowDefinition: (id: string) => ResultAsync<WorkflowDefinition | null, never>;
    getWorkflowDefinitions: () => ResultAsync<WorkflowDefinition[], never>;
    saveWorkflowRun: (_run: WorkflowRunRecord) => ResultAsync<void, never>;
    updateWorkflowRun: (_id: string, _updates: Partial<WorkflowRunRecord>) => ResultAsync<void, never>;
    getWorkflowRun: (_id: string) => ResultAsync<null, never>;
    getWorkflowRuns: () => ResultAsync<never[], never>;
    saveWorkflowStepRun: (_stepRun: WorkflowStepRunRecord) => ResultAsync<void, never>;
    updateWorkflowStepRun: (_id: string, _updates: Partial<WorkflowStepRunRecord>) => ResultAsync<void, never>;
    getWorkflowStepRuns: () => ResultAsync<never[], never>;
    commitAtomicWorkflowTransition: (_input: AtomicWorkflowTransitionInput) => ResultAsync<void, never>;
};

function createInMemoryPersistence(): InMemoryWorkflowPersistence {
    const definitions = new Map<string, WorkflowDefinition>();

    return {
        saveWorkflowDefinition: (definition: WorkflowDefinition): ResultAsync<void, never> => {
            definitions.set(definition.id, definition);
            return okAsync(undefined);
        },
        getWorkflowDefinition: (id: string): ResultAsync<WorkflowDefinition | null, never> => okAsync(definitions.get(id) ?? null),
        getWorkflowDefinitions: (): ResultAsync<WorkflowDefinition[], never> => okAsync(Array.from(definitions.values())),
        saveWorkflowRun: (_run: WorkflowRunRecord): ResultAsync<void, never> => okAsync(undefined),
        updateWorkflowRun: (_id: string, _updates: Partial<WorkflowRunRecord>): ResultAsync<void, never> => okAsync(undefined),
        getWorkflowRun: (_id: string): ResultAsync<null, never> => okAsync(null),
        getWorkflowRuns: (): ResultAsync<never[], never> => okAsync([]),
        saveWorkflowStepRun: (_stepRun: WorkflowStepRunRecord): ResultAsync<void, never> => okAsync(undefined),
        updateWorkflowStepRun: (_id: string, _updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, never> => okAsync(undefined),
        getWorkflowStepRuns: (): ResultAsync<never[], never> => okAsync([]),
        commitAtomicWorkflowTransition: (_input: AtomicWorkflowTransitionInput): ResultAsync<void, never> => okAsync(undefined)
    };
}

describe('Workflow lifecycle integration', () => {
    it('runs create -> publish -> next version lifecycle with persisted state', async () => {
        const persistence = createInMemoryPersistence();
        const logger = { info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined, debug: (): void => undefined };
        const service = new WorkflowDefinitionService(persistence as unknown as never, logger as unknown as never);

        const draft = await service.createDraft({
            name: 'Workflow A',
            description: 'Initial draft',
            platformConfig: { platform: 'web', url: 'https://example.com' },
            steps: [{ name: 'Step 1', prompt: 'do thing', continueOnFailure: false }]
        });

        const published = await service.publishDraft(draft.id);
        const nextDraft = await service.createNextDraftVersion(published.id);

        expect(draft.status).toBe('draft');
        expect(published.status).toBe('published');
        expect(nextDraft.status).toBe('draft');
        expect(nextDraft.version).toBe(2);

        const stored = await persistence.getWorkflowDefinitions();
        expect(stored.isOk()).toBe(true);
        expect(stored._unsafeUnwrap()).toHaveLength(2);
    });
});
