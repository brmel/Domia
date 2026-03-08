import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import type { ILogger } from '@domain/ports';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunOptions } from '@shared/validation';

interface CreateWorkflowDefinitionRequest {
    readonly name: string;
    readonly description?: string;
    readonly platformConfig: PlatformConfig;
    readonly steps: ReadonlyArray<{
        readonly name: string;
        readonly prompt: string;
        readonly continueOnFailure: boolean;
        readonly options?: RunOptions;
    }>;
}

interface UpdateWorkflowDefinitionRequest {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly platformConfig?: PlatformConfig;
    readonly steps: ReadonlyArray<{
        readonly id?: string;
        readonly name: string;
        readonly prompt: string;
        readonly continueOnFailure: boolean;
        readonly options?: RunOptions;
    }>;
}

@injectable()
export class WorkflowDefinitionService {
    constructor(
        @inject('IWorkflowRepository') private readonly persistence: IWorkflowRepository,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async createDraft(request: CreateWorkflowDefinitionRequest): Promise<WorkflowDefinition> {
        const now = new Date().toISOString();
        const id = randomUUID();

        const definition: WorkflowDefinition = {
            id,
            name: request.name.trim(),
            ...(request.description?.trim() ? { description: request.description.trim() } : {}),
            status: 'draft',
            version: 1,
            platformConfig: request.platformConfig,
            steps: this.normalizeNewSteps(id, request.steps),
            createdAt: now,
            updatedAt: now
        };

        const saveResult = await this.persistence.saveWorkflowDefinition(definition);
        if (saveResult.isErr()) {
            throw new Error(saveResult.error.message);
        }

        return definition;
    }

    async updateDraft(request: UpdateWorkflowDefinitionRequest): Promise<WorkflowDefinition> {
        const existingResult = await this.persistence.getWorkflowDefinition(request.id);
        if (existingResult.isErr()) {
            throw new Error(existingResult.error.message);
        }

        const existing = existingResult.value;
        if (!existing) {
            throw new Error(`Workflow definition not found: ${request.id}`);
        }

        if (existing.status !== 'draft') {
            throw new Error('Only draft workflow definitions can be updated.');
        }

        const updated: WorkflowDefinition = {
            ...existing,
            name: request.name.trim(),
            ...(request.description?.trim() ? { description: request.description.trim() } : {}),
            ...(request.platformConfig ? { platformConfig: request.platformConfig } : {}),
            steps: this.normalizeExistingSteps(existing.id, request.steps),
            updatedAt: new Date().toISOString()
        };

        const saveResult = await this.persistence.saveWorkflowDefinition(updated);
        if (saveResult.isErr()) {
            throw new Error(saveResult.error.message);
        }

        return updated;
    }

    async publishDraft(definitionId: string): Promise<WorkflowDefinition> {
        const existingResult = await this.persistence.getWorkflowDefinition(definitionId);
        if (existingResult.isErr()) {
            throw new Error(existingResult.error.message);
        }

        const existing = existingResult.value;
        if (!existing) {
            throw new Error(`Workflow definition not found: ${definitionId}`);
        }

        if (existing.status === 'published') {
            return existing;
        }

        const published: WorkflowDefinition = {
            ...existing,
            status: 'published',
            updatedAt: new Date().toISOString()
        };

        const saveResult = await this.persistence.saveWorkflowDefinition(published);
        if (saveResult.isErr()) {
            throw new Error(saveResult.error.message);
        }

        return published;
    }

    async createNextDraftVersion(sourceDefinitionId: string): Promise<WorkflowDefinition> {
        const sourceResult = await this.persistence.getWorkflowDefinition(sourceDefinitionId);
        if (sourceResult.isErr()) {
            throw new Error(sourceResult.error.message);
        }

        const source = sourceResult.value;
        if (!source) {
            throw new Error(`Workflow definition not found: ${sourceDefinitionId}`);
        }

        const now = new Date().toISOString();
        const next: WorkflowDefinition = {
            ...source,
            id: randomUUID(),
            status: 'draft',
            version: source.version + 1,
            steps: source.steps.map((step, index) => ({
                ...step,
                id: `${source.id}-v${source.version + 1}-step-${index + 1}`
            })),
            createdAt: now,
            updatedAt: now
        };

        const saveResult = await this.persistence.saveWorkflowDefinition(next);
        if (saveResult.isErr()) {
            throw new Error(saveResult.error.message);
        }

        this.logger.info('[WorkflowDefinitionService] Created next draft workflow version', {
            sourceDefinitionId,
            nextDefinitionId: next.id,
            version: next.version
        });

        return next;
    }

    private normalizeNewSteps(
        workflowId: string,
        steps: ReadonlyArray<{
            readonly name: string;
            readonly prompt: string;
            readonly continueOnFailure: boolean;
            readonly options?: RunOptions;
        }>
    ): ReadonlyArray<WorkflowStepDefinition> {
        return steps.map((step, index) => ({
            id: `${workflowId}-step-${index + 1}`,
            name: step.name.trim(),
            prompt: step.prompt.trim(),
            continueOnFailure: step.continueOnFailure,
            ...(step.options ? { options: step.options } : {})
        }));
    }

    private normalizeExistingSteps(
        workflowId: string,
        steps: ReadonlyArray<{
            readonly id?: string;
            readonly name: string;
            readonly prompt: string;
            readonly continueOnFailure: boolean;
            readonly options?: RunOptions;
        }>
    ): ReadonlyArray<WorkflowStepDefinition> {
        return steps.map((step, index) => ({
            id: step.id?.trim() || `${workflowId}-step-${index + 1}`,
            name: step.name.trim(),
            prompt: step.prompt.trim(),
            continueOnFailure: step.continueOnFailure,
            ...(step.options ? { options: step.options } : {})
        }));
    }
}
