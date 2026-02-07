import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation } from '@domain/ports';
import type { ILLMProvider, LLMContext, ILogger } from '@domain/ports';
import type { IArtifactStorage } from '@domain/ports';
import type { TestRunEvent, CancellationToken } from '@domain/events';
import type { AgentAction, Url } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';
import { TestStepFactory } from '@domain/entities';
import { isTerminalAction } from '@domain/value-objects/AgentAction';
import { TestRunIdFactory } from '@domain/value-objects';
import type { TestInput } from '../../shared/validation';

const DEFAULT_MAX_STEPS = 20;

import { ActionHandlerRegistry } from '../../application/action-handlers/ActionHandlerRegistry';
import { InteractionError } from '@domain/errors';

@injectable()
export class RunTestUseCase {
    constructor(
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('ILLMProvider') private readonly llm: ILLMProvider,
        @inject('IArtifactStorage') private readonly artifacts: IArtifactStorage,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(ActionHandlerRegistry) private readonly actionRegistry: ActionHandlerRegistry
    ) { }

    async *execute(
        input: TestInput,
        cancellation: CancellationToken
    ): AsyncGenerator<TestRunEvent, void, undefined> {
        // ... (Keep existing setup code)

        this.logger.info('Starting test run execution');

        const testInput = input;
        const maxSteps = testInput.options?.maxSteps ?? DEFAULT_MAX_STEPS;

        // Create test run ID
        const testRunId = TestRunIdFactory.create();
        this.logger.info(`Test run initialized`, { testRunId, url: testInput.url });

        yield { type: 'started', testRunId };

        // Launch browser
        this.logger.debug('Launching browser');
        const launchResult = await this.browser.launch({
            headless: testInput.options?.headless ?? true,
        });
        if (launchResult.isErr()) {
            this.logger.error('Browser launch failed', launchResult.error);
            yield { type: 'error', error: launchResult.error };
            return;
        }

        try {
            // Navigate to URL
            this.logger.debug(`Navigating to ${testInput.url}`);
            const navResult = await this.browser.navigateTo(testInput.url as Url);
            if (navResult.isErr()) {
                this.logger.error('Navigation failed', navResult.error);
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
                    this.logger.info('Test run cancelled by user');
                    yield { type: 'cancelled' };
                    return;
                }

                stepNumber++;
                this.logger.info(`Starting step ${stepNumber}`);

                // OBSERVE
                yield { type: 'observing' };
                const snapshotResult = await this.browser.snapshot();
                if (snapshotResult.isErr()) {
                    this.logger.error('Snapshot failed', snapshotResult.error);
                    yield { type: 'error', error: snapshotResult.error };
                    break;
                }
                const snapshot = snapshotResult.value;

                // Take screenshot
                const screenshotResult = await this.browser.screenshot();
                if (screenshotResult.isOk()) {
                    const base64 = screenshotResult.value.data.toString('base64');
                    yield { type: 'screenshot', data: base64 };
                    // Save screenshot artifact
                    await this.artifacts.saveScreenshot(testRunId, stepNumber, screenshotResult.value.data);
                }

                // Get viewport size for layout analysis
                const viewport = await this.browser.getViewportSize();

                // Build LLM context
                const context: LLMContext = {
                    goal: testInput.prompt,
                    currentUrl: snapshot.url,
                    pageTitle: snapshot.title,
                    snapshot,
                    previousActions,
                    stepsRemaining: maxSteps - stepNumber,
                    viewport,
                };

                // THINK
                yield { type: 'thinking' };
                this.logger.debug('Generating action from LLM');
                const actionResult = await this.llm.generateAction(context);
                if (actionResult.isErr()) {
                    this.logger.error('LLM generation failed', actionResult.error);
                    yield { type: 'error', error: actionResult.error };
                    break;
                }
                const action = actionResult.value;
                this.logger.info('Agent decided action', { action: action.type });
                previousActions.push(action);

                // ACT
                yield { type: 'acting', action };

                // Check if terminal action
                if (isTerminalAction(action)) {
                    completed = true;
                    finalSummary = action.type === 'pass' ? action.summary : action.reason;
                    this.logger.info(`Terminal action reached: ${action.type}`, { summary: finalSummary });
                } else {
                    // Perform browser action using registry
                    this.logger.debug('Performing browser action', { action });

                    const handler = this.actionRegistry.get(action.type);
                    if (!handler) {
                        const error = new InteractionError(`No handler found for action type: ${action.type}`);
                        this.logger.error('Action execution failed', error);
                        yield { type: 'error', error };
                        break;
                    }

                    const performResult = await handler.execute(action, this.browser);
                    if (performResult.isErr()) {
                        this.logger.error('Action execution failed', performResult.error);
                        yield { type: 'error', error: performResult.error };
                        break;
                    }

                    // Wait for DOM to stabilize after action
                    this.logger.debug('Waiting for DOM to stabilize');
                    await this.browser.waitForDOMStable();
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
            this.logger.info(`Test run complete. Success: ${success}`);

            yield {
                type: 'completed',
                success,
                summary: finalSummary || (success ? 'Test completed successfully' : 'Agent stopped without reaching a conclusion (Max steps reached or manual stop)'),
            };

        } finally {
            // Close browser
            this.logger.debug('Closing browser');
            await this.browser.close();
        }
    }
}
