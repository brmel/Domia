import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowDefinitionService } from './WorkflowDefinitionService';

describe('WorkflowDefinitionService', () => {
    it('creates draft workflow definition with generated step ids', async () => {
        const persistence = {
            saveWorkflowDefinition: vi.fn(() => okAsync(undefined))
        };

        const service = new WorkflowDefinitionService(
            persistence as any,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
        );

        const definition = await service.createDraft({
            name: 'My Workflow',
            platformConfig: { platform: 'web', url: 'https://example.com' },
            steps: [
                {
                    name: 'Step 1',
                    prompt: 'do thing',
                    continueOnFailure: false
                }
            ]
        });

        expect(definition.status).toBe('draft');
        expect(definition.steps[0]?.id).toContain('-step-1');
        expect(persistence.saveWorkflowDefinition).toHaveBeenCalledOnce();
    });

    it('publishes a draft definition', async () => {
        const current = {
            id: 'wf-1',
            name: 'WF',
            status: 'draft' as const,
            version: 1,
            platformConfig: { platform: 'web' as const, url: 'https://example.com' },
            steps: [{ id: 's1', name: 's1', prompt: 'p', continueOnFailure: false }],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
        };

        const persistence = {
            getWorkflowDefinition: vi.fn(() => okAsync(current)),
            saveWorkflowDefinition: vi.fn(() => okAsync(undefined))
        };

        const service = new WorkflowDefinitionService(
            persistence as any,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
        );

        const published = await service.publishDraft('wf-1');
        expect(published.status).toBe('published');
        expect(persistence.saveWorkflowDefinition).toHaveBeenCalledOnce();
    });
});
