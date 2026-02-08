import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, LLMContext, ILogger } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '@domain/errors';

export interface SnapshotResult {
    context: LLMContext;
    screenshotBuffer?: Buffer;
}

@injectable()
export class SnapshotService {
    constructor(
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async capture(
        stepNumber: number,
        prompt: string,
        previousActions: AgentAction[],
        maxSteps: number
    ): Promise<Result<SnapshotResult, DomainError>> {
        const snapshotResult = await this.browser.snapshot();
        if (snapshotResult.isErr()) {
            this.logger.error('Snapshot failed', snapshotResult.error);
            return err(snapshotResult.error);
        }
        const snapshot = snapshotResult.value;

        const screenshotResult = await this.browser.screenshot();
        let screenshotBuffer: Buffer | undefined;

        if (screenshotResult.isOk()) {
            screenshotBuffer = screenshotResult.value.data;
        } else {
            this.logger.warn('Screenshot failed, proceeding without it', { error: screenshotResult.error });
        }

        const viewport = await this.browser.getViewportSize();

        const context: LLMContext = {
            goal: prompt,
            currentUrl: snapshot.url,
            pageTitle: snapshot.title,
            snapshot,
            previousActions,
            stepsRemaining: maxSteps - stepNumber,
            viewport,
        };

        const result: SnapshotResult = { context };
        if (screenshotBuffer) {
            result.screenshotBuffer = screenshotBuffer;
        }

        return ok(result);
    }
}
