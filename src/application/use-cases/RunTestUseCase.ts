import { injectable, inject } from 'tsyringe';
import type { IInputPort } from '@domain/ports';
import type { IOutputPort } from '@domain/ports';
import type { IBrowserAutomation } from '@domain/ports';
import type { ILLMProvider, LLMContext } from '@domain/ports';
import type { ITestRunStorage, IArtifactStorage } from '@domain/ports';
import type { TestRunEvent, CancellationToken } from '@domain/events';
import type { AgentAction, Url } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';
import { TestStepFactory } from '@domain/entities';
import { isTerminalAction } from '@domain/value-objects/AgentAction';
import { TestRunIdFactory } from '@domain/value-objects';

const DEFAULT_MAX_STEPS = 20;

/**
 * RunTestUseCase
 * Orchestrates the agent loop with AsyncGenerator for streaming events
 */
@injectable()
export class RunTestUseCase {
    constructor(
        @inject('IInputPort') private readonly input: IInputPort,
        // @ts-expect-error - Will be used for output formatting in future
        @inject('IOutputPort') private readonly _output: IOutputPort,
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('ILLMProvider') private readonly llm: ILLMProvider,
        // @ts-expect-error - Will be used for test run persistence in future
        @inject('ITestRunStorage') private readonly _storage: ITestRunStorage,
        @inject('IArtifactStorage') private readonly artifacts: IArtifactStorage
    ) { }

    /**
     * Execute the agent loop
     * Yields TestRunEvent for real-time UI updates
     * Returns final output when complete
     */
    async *execute(
        raw: unknown,
        cancellation: CancellationToken
    ): AsyncGenerator<TestRunEvent, void, undefined> {
        // Parse and validate input
        const parseResult = this.input.parse(raw);
        if (parseResult.isErr()) {
            yield { type: 'error', error: parseResult.error };
            return;
        }
        const testInput = parseResult.value;
        const maxSteps = testInput.options?.maxSteps ?? DEFAULT_MAX_STEPS;

        // Create test run ID
        const testRunId = TestRunIdFactory.create();

        yield { type: 'started', testRunId };

        // Launch browser
        const launchResult = await this.browser.launch({
            headless: testInput.options?.headless ?? true,
        });
        if (launchResult.isErr()) {
            yield { type: 'error', error: launchResult.error };
            return;
        }

        try {
            // Navigate to URL
            const navResult = await this.browser.navigateTo(testInput.url as Url);
            if (navResult.isErr()) {
                yield { type: 'error', error: navResult.error };
                return;
            }

            const previousActions: AgentAction[] = [];
            let stepNumber = 0;
            let completed = false;
            let finalSummary = '';

            // Agent loop
            while (stepNumber < maxSteps && !completed) {
                // Cooperative cancellation check
                if (cancellation.requested) {
                    yield { type: 'cancelled' };
                    return;
                }

                stepNumber++;

                // OBSERVE
                yield { type: 'observing' };
                const snapshotResult = await this.browser.snapshot();
                if (snapshotResult.isErr()) {
                    yield { type: 'error', error: snapshotResult.error };
                    break;
                }
                const snapshot = snapshotResult.value;

                // Take screenshot
                const screenshotResult = await this.browser.screenshot();
                if (screenshotResult.isOk()) {
                    yield { type: 'screenshot', data: screenshotResult.value.data };
                    // Save screenshot artifact
                    await this.artifacts.saveScreenshot(testRunId, stepNumber, screenshotResult.value.data);
                }

                // Build LLM context
                const context: LLMContext = {
                    goal: testInput.prompt,
                    currentUrl: 'unknown', // Browser adapter should expose this
                    pageTitle: snapshot.title,
                    snapshot,
                    previousActions,
                    stepsRemaining: maxSteps - stepNumber,
                };

                // THINK
                yield { type: 'thinking' };
                const actionResult = await this.llm.generateAction(context);
                if (actionResult.isErr()) {
                    yield { type: 'error', error: actionResult.error };
                    break;
                }
                const action = actionResult.value;
                previousActions.push(action);

                // ACT
                yield { type: 'acting', action };

                // Check if terminal action
                if (isTerminalAction(action)) {
                    completed = true;
                    finalSummary = action.type === 'pass' ? action.summary : action.reason;
                } else {
                    // Perform browser action
                    const performResult = await this.performAction(action);
                    if (performResult.isErr()) {
                        yield { type: 'error', error: performResult.error };
                        break;
                    }
                }

                // Create step record using factory
                const step: TestStep = TestStepFactory.create({ stepNumber, action });
                const finalStep = completed
                    ? (action.type === 'pass'
                        ? TestStepFactory.markSuccess(step, null, 0)
                        : TestStepFactory.markFailed(step, finalSummary, 0))
                    : TestStepFactory.markSuccess(step, null, 0);

                yield { type: 'step_complete', step: finalStep };
            }

            // Build final output
            const success = completed && previousActions.some(a => a.type === 'pass');
            yield {
                type: 'completed',
                success,
                summary: finalSummary || (success ? 'Test completed successfully' : 'Test did not complete goal'),
            };

        } finally {
            // Close browser
            await this.browser.close();
        }
    }

    private async performAction(action: AgentAction) {
        switch (action.type) {
            case 'click':
                return this.browser.click(action.elementId);
            case 'type':
                return this.browser.type(action.elementId, action.text);
            case 'scroll':
                return this.browser.scroll(action.direction);
            case 'wait':
                return this.browser.wait(action.durationMs);
            case 'extract':
                // Extract doesn't require browser action
                return { isErr: () => false, isOk: () => true } as never;
            default:
                // Terminal actions handled separately
                return { isErr: () => false, isOk: () => true } as never;
        }
    }
}
