import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import { RunIdFactory, RunId, UrlFactory } from '@domain/value-objects';
import { TestRun } from '@domain/entities/Run';
import type { IPersistenceAdapter, ILogger } from '@domain/ports';

@injectable()
export class RunLifecycleManager {
    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async initializeRun(urlString: string, prompt: string): Promise<Result<RunId, Error>> {
        const id = RunIdFactory.create();
        const urlResult = UrlFactory.create(urlString);

        if (urlResult.isErr()) {
            return err(new Error(`Invalid URL: ${urlResult.error.message}`));
        }

        this.logger.info(`Run initialized`, { id, url: urlString });

        const testRun = TestRun.create({
            id,
            url: urlResult.value,
            prompt
        });

        const runningRun = TestRun.start(testRun);

        try {
            await this.persistence.saveRun(runningRun);
            return ok(id);
        } catch (error) {
            return err(new Error(`Failed to save run: ${error}`));
        }
    }

    async finalizeRun(id: RunId, success: boolean, summary?: string): Promise<void> {
        this.logger.info(`Run complete. Success: ${success}`);

        const existingResult = await this.persistence.getRun(id);
        if (existingResult.isErr()) {
            this.logger.warn(`Cannot finalize run ${id}: ${existingResult.error.message}`);
            return;
        }
        const existing = existingResult.value;
        if (!existing) {
            this.logger.warn(`Cannot finalize run ${id}: not found`);
            return;
        }

        const finalized = success
            ? TestRun.pass(existing, summary || 'Test completed successfully')
            : TestRun.fail(existing, summary || 'Unknown error');

        await this.persistence.updateRun(id, {
            status: finalized.status,
            updatedAt: finalized.updatedAt
        });
    }

    async failRun(id: RunId, message: string): Promise<void> {
        this.logger.warn(`Run failed: ${message}`);

        const existingResult = await this.persistence.getRun(id);
        if (existingResult.isErr()) {
            this.logger.warn(`Cannot fail run ${id}: ${existingResult.error.message}`);
            return;
        }
        const existing = existingResult.value;
        if (!existing) {
            this.logger.warn(`Cannot fail run ${id}: not found`);
            return;
        }

        const failed = TestRun.fail(existing, message);

        await this.persistence.updateRun(id, {
            status: failed.status,
            updatedAt: failed.updatedAt
        });
    }
}
