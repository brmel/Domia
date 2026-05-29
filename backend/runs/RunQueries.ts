import { inject, injectable } from 'tsyringe';
import type { IStorageService } from '@domain/ports';
import type { IRunRepository } from '@domain/ports/IRunRepository';

@injectable()
export class RunQueries {
    constructor(
        @inject('IRunRepository') private readonly persistence: IRunRepository,
        @inject('IStorageService') private readonly storage: IStorageService,
    ) {}

    async listRuns() {
        const result = await this.persistence.getRuns();
        if (result.isErr()) throw result.error;
        return result.value;
    }

    async getRunWithSteps(id: string) {
        const runResult = await this.persistence.getRun(id);
        if (runResult.isErr()) throw runResult.error;
        if (!runResult.value) return null;
        const stepsResult = await this.persistence.getSteps(id);
        if (stepsResult.isErr()) throw stepsResult.error;
        return { ...runResult.value, steps: stepsResult.value };
    }

    async getStepDetail(runId: string, stepNumber: number) {
        const result = await this.persistence.getStep(runId, stepNumber);
        if (result.isErr()) throw result.error;
        return result.value ?? undefined;
    }

    getStepArtifacts(runId: string, stepNumber: number) {
        return this.storage.getStepArtifacts(runId, stepNumber);
    }

    async clearHistory() {
        const result = await this.persistence.clearHistory();
        if (result.isErr()) throw result.error;
    }
}
