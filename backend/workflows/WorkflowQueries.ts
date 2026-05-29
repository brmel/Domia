import { inject, injectable } from 'tsyringe';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import { DEFAULT_WORKFLOWS_QUERY_LIMIT } from '@shared/defaults';

@injectable()
export class WorkflowQueries {
    constructor(
        @inject('IWorkflowRepository') private readonly persistence: IWorkflowRepository,
    ) {}

    async listDefinitions(limit = DEFAULT_WORKFLOWS_QUERY_LIMIT) {
        const result = await this.persistence.getWorkflowDefinitions(limit);
        if (result.isErr()) throw result.error;
        return result.value;
    }

    async getDefinition(id: string) {
        const result = await this.persistence.getWorkflowDefinition(id);
        if (result.isErr()) throw result.error;
        return result.value ?? undefined;
    }

    async listRuns(limit = DEFAULT_WORKFLOWS_QUERY_LIMIT) {
        const result = await this.persistence.getWorkflowRuns(limit);
        if (result.isErr()) throw result.error;
        return result.value;
    }

    async getRun(id: string) {
        const result = await this.persistence.getWorkflowRun(id);
        if (result.isErr()) throw result.error;
        return result.value ?? undefined;
    }
}
