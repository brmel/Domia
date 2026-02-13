import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import { TestRunIdFactory, TestRunId, UrlFactory } from '@domain/value-objects';
import { TestRun } from '@domain/entities/TestRun';
import type { IPersistenceAdapter, ILogger } from '@domain/ports';

@injectable()
export class TestRunLifecycleManager {
    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async initializeTestRun(urlString: string, prompt: string): Promise<Result<TestRunId, Error>> {
        const id = TestRunIdFactory.create();
        const urlResult = UrlFactory.create(urlString);

        if (urlResult.isErr()) {
            return err(new Error(`Invalid URL: ${urlResult.error.message}`));
        }

        this.logger.info(`Test run initialized`, { id, url: urlString });

        const testRun = TestRun.create({
            id,
            url: urlResult.value,
            prompt
        });

        // Immediately start it as per previous logic, or keep pending? 
        // Previous logic set status: 'running'.
        const runningRun = TestRun.start(testRun);

        try {
            await this.persistence.saveTestRun(runningRun);
            return ok(id);
        } catch (error) {
            return err(new Error(`Failed to save test run: ${error}`));
        }
    }

    async finalizeTestRun(id: TestRunId, success: boolean, summary?: string): Promise<void> {
        this.logger.info(`Test run complete. Success: ${success}`);

        const status: import('@domain/entities/TestRun').TestRunStatus = success
            ? { type: 'passed', summary: summary || 'Test completed successfully', duration: 0 }
            : { type: 'failed', error: summary || 'Unknown error', duration: 0 };

        await this.persistence.updateTestRun(id, {
            status,
            completedAt: new Date().toISOString()
        } as any);
    }

    async failTestRun(id: TestRunId, message: string): Promise<void> {
        this.logger.warn(`Test run failed: ${message}`);
        const status: import('@domain/entities/TestRun').TestRunStatus = {
            type: 'failed',
            error: message,
            duration: 0
        };

        await this.persistence.updateTestRun(id, {
            status,
            completedAt: new Date().toISOString()
        } as any);
    }
}
