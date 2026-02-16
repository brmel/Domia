import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowDefinitionService } from './WorkflowDefinitionService';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';

function createInMemoryPersistence() {
    const definitions = new Map<string, WorkflowDefinition>();

    return {
        saveWorkflowDefinition: (definition: WorkflowDefinition) => {
            definitions.set(definition.id, definition);
            return okAsync(undefined);
        },
        getWorkflowDefinition: (id: string) => okAsync(definitions.get(id) ?? null),
        getWorkflowDefinitions: () => okAsync(Array.from(definitions.values())),
        saveWorkflowRun: (_run: WorkflowRunRecord) => okAsync(undefined),
        updateWorkflowRun: (_id: string, _updates: Partial<WorkflowRunRecord>) => okAsync(undefined),
        getWorkflowRun: (_id: string) => okAsync(null),
        getWorkflowRuns: () => okAsync([]),
        saveWorkflowStepRun: (_stepRun: WorkflowStepRunRecord) => okAsync(undefined),
        updateWorkflowStepRun: (_id: string, _updates: Partial<WorkflowStepRunRecord>) => okAsync(undefined),
        getWorkflowStepRuns: () => okAsync([]),
        commitAtomicWorkflowTransition: (_input: AtomicWorkflowTransitionInput) => okAsync(undefined)
    };
}

describe('Workflow lifecycle integration', () => {
    it('runs create -> publish -> next version lifecycle with persisted state', async () => {
        const persistence = createInMemoryPersistence();
        const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
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
