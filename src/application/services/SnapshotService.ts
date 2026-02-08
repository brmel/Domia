import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, LLMContext, ILogger } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '@domain/errors';

export interface SnapshotResult {
    context: LLMContext;
}

@injectable()
export class SnapshotService {
    constructor(
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async perform(
        browser: IBrowserAutomation,
        _testRunId: string,
        stepNumber: number,
        prompt: string,
        previousActions: AgentAction[],
        maxSteps: number
    ): Promise<Result<SnapshotResult, DomainError>> {
        const snapshotResult = await browser.snapshot();
        if (snapshotResult.isErr()) {
            this.logger.error('Snapshot failed', snapshotResult.error);
            return err(snapshotResult.error);
        }
        const snapshot = snapshotResult.value;
        const viewport = await browser.getViewportSize();

        const context: LLMContext = {
            goal: prompt,
            currentUrl: snapshot.url,
            pageTitle: snapshot.title,
            snapshot,
            previousActions,
            stepsRemaining: maxSteps - stepNumber,
            viewport,
        };

        return ok({ context });
    }
}
