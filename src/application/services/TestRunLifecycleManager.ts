import { injectable, inject } from 'tsyringe';
import type { IPersistenceAdapter, ILogger } from '@domain/ports';

@injectable()
export class TestRunLifecycleManager {
    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async initialize(id: string, url: string, prompt: string): Promise<void> {
        this.logger.info(`Test run initialized`, { id, url });
        await this.persistence.saveTestRun({
            id,
            url,
            status: 'running',
            startedAt: new Date().toISOString(),
            goal: prompt
        });
    }

    async finalize(id: string, success: boolean, summary?: string): Promise<void> {
        this.logger.info(`Test run complete. Success: ${success}`);
        await this.persistence.updateTestRun(id, {
            status: success ? 'pass' : 'fail',
            completedAt: new Date().toISOString(),
            summary: summary || (success ? 'Test completed successfully' : 'Agent stopped without reaching a conclusion')
        });
    }

    async fail(id: string, summary: string): Promise<void> {
        this.logger.error(summary);
        await this.persistence.updateTestRun(id, {
            status: 'fail',
            completedAt: new Date().toISOString(),
            summary
        });
    }
}
