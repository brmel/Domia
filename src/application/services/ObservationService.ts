import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, LLMContext, ILogger, IArtifactStorage } from '@domain/ports';
import { TestRunIdFactory } from '@domain/value-objects';
import type { AgentAction } from '@domain/value-objects';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '@domain/errors';

export interface ObservationResult {
    context: LLMContext;
    screenshotBase64?: string;
    screenshotPath?: string;
}

@injectable()
export class ObservationService {
    constructor(
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('IArtifactStorage') private readonly artifacts: IArtifactStorage,
        @inject('ILogger') private readonly logger: ILogger
    ) { }

    async perform(
        testRunId: string,
        stepNumber: number,
        prompt: string,
        previousActions: AgentAction[],
        maxSteps: number
    ): Promise<Result<ObservationResult, DomainError>> {
        const snapshotResult = await this.browser.snapshot();
        if (snapshotResult.isErr()) {
            this.logger.error('Snapshot failed', snapshotResult.error);
            return err(snapshotResult.error);
        }
        const snapshot = snapshotResult.value;

        const screenshotResult = await this.browser.screenshot();
        let screenshotBase64: string | undefined;
        let screenshotPath: string | undefined;

        if (screenshotResult.isOk()) {
            screenshotBase64 = screenshotResult.value.data.toString('base64');
            const savedResult = await this.artifacts.saveScreenshot(
                TestRunIdFactory.fromString(testRunId),
                stepNumber,
                screenshotResult.value.data
            );
            if (savedResult.isOk()) {
                screenshotPath = String(savedResult.value);
            }
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

        const result: ObservationResult = {
            context
        };
        if (screenshotBase64) result.screenshotBase64 = screenshotBase64;
        if (screenshotPath) result.screenshotPath = screenshotPath;

        return ok(result);
    }
}
