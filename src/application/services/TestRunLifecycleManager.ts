import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import { TestRunIdFactory, TestRunId } from '@domain/value-objects';
import type { IPersistenceAdapter, ILogger } from '@domain/ports';

@injectable()
export class TestRunLifecycleManager {
    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async initializeTestRun(url: string, prompt: string): Promise<Result<TestRunId, Error>> {
        const id = TestRunIdFactory.create();
        this.logger.info(`Test run initialized`, { id, url });
        try {
            await this.persistence.saveTestRun({
                id,
                url,
                status: 'running',
                startedAt: new Date().toISOString(),
                goal: prompt
            });
            return ok(id);
        } catch (error) {
            return err(new Error(`Failed to save test run: ${error}`));
        }
    }

    async finalizeTestRun(id: TestRunId, success: boolean, summary?: string): Promise<void> {
        this.logger.info(`Test run complete. Success: ${success}`);
        await this.persistence.updateTestRun(id, {
            status: success ? 'pass' : 'fail',
            completedAt: new Date().toISOString(),
            summary: summary || (success ? 'Test completed successfully' : 'Agent stopped without reaching a conclusion')
        });
    }

    async failTestRun(id: TestRunId, summary: string): Promise<void> {
        this.logger.error(summary);
        await this.persistence.updateTestRun(id, {
            status: 'fail',
            completedAt: new Date().toISOString(),
            summary
        });
    }
}
