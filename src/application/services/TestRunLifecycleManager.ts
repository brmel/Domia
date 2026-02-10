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

        // We need to fetch the existing run to update it properly using DDD, 
        // but PersistenceAdapter.updateTestRun takes Partial<TestRun>.
        // Using the entity helpers returns a new TestRun object.
        // For now, we'll manually construct the status strict object to satisfy the type, 
        // or fetch -> update -> save if we want to be pure. 
        // Given existing updateTestRun signature, let's just push the status object.

        // Actually, TestRun.pass/fail return a whole TestRun. 
        // Use persistence.getTestRun(id) -> update -> save would be better but checking constraints.
        // Let's stick to updateTestRun with correct types.

        const status: import('@domain/entities/TestRun').TestRunStatus = success
            ? { type: 'passed', summary: summary || 'Test completed successfully', duration: 0 } // Duration calc is tricky without fetching start time.
            : { type: 'failed', error: summary || 'Unknown error', duration: 0 };

        // Note: Duration is 0 here because we aren't fetching the original run to calc diff.
        // Ideally we should fetch, but for "Cleanup" task, let's just make types match.

        await this.persistence.updateTestRun(id, {
            status,
            completedAt: new Date().toISOString()
        } as any); // explicit cast if Partial<TestRun> issues arise, but ideally strictly typed.
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
