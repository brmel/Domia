
import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation } from '@domain/ports';
import type { ILLMProvider, LLMContext, ILogger } from '@domain/ports';
import type { IArtifactStorage } from '@domain/ports';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, Url } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';
import { TestStepFactory } from '@domain/entities';
import { isTerminalAction } from '@domain/value-objects/AgentAction';
import { TestRunIdFactory, ArtifactPathFactory } from '@domain/value-objects';
import type { TestInput } from '../../shared/validation';
import type { IPersistenceAdapter, TestStep as PersistenceTestStep } from '@domain/ports';
import { ExecutionController } from '../controllers/ExecutionController';
import { TestRunState } from '../../domain/enums/TestRunState';

import { ToolRegistry } from '../../application/registries/ToolRegistry';
import { ToolContext } from '../../domain/tools/Tool';
import { InteractionError } from '@domain/errors';

const DEFAULT_MAX_STEPS = 20;

@injectable()
export class RunTestUseCase {
    constructor(
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('ILLMProvider') private readonly llm: ILLMProvider,
        @inject('IArtifactStorage') private readonly artifacts: IArtifactStorage,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(ToolRegistry) private readonly toolRegistry: ToolRegistry,
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter
    ) { }

    async *execute(
        input: TestInput,
        controller: ExecutionController
    ): AsyncGenerator<TestRunEvent, void, undefined> {
        this.logger.info('Starting test run execution');

        const testInput = input;
        const maxSteps = testInput.options?.maxSteps ?? DEFAULT_MAX_STEPS;

        // Create test run ID
        const testRunId = TestRunIdFactory.create();
        this.logger.info(`Test run initialized`, { testRunId, url: testInput.url });

        await this.persistence.saveTestRun({
            id: testRunId,
            url: testInput.url,
            status: 'running',
            startedAt: new Date().toISOString(),
            goal: testInput.prompt
        });

        // Start the controller
        controller.start();
        yield { type: 'started', testRunId };

        this.logger.debug('Launching browser');
        const launchResult = await this.browser.launch({
            headless: testInput.options?.headless ?? true,
        });
        if (launchResult.isErr()) {
            this.logger.error('Browser launch failed', launchResult.error);
            yield { type: 'error', error: launchResult.error };

            await this.persistence.updateTestRun(testRunId, {
                status: 'fail',
                completedAt: new Date().toISOString(),
                summary: `Browser launch failed: ${launchResult.error.message}`
            });
            return;
        }

        try {
            this.logger.debug(`Navigating to ${testInput.url}`);
            const navResult = await this.browser.navigateTo(testInput.url as Url);
            if (navResult.isErr()) {
                this.logger.error('Navigation failed', navResult.error);
                yield { type: 'error', error: navResult.error };

                await this.persistence.updateTestRun(testRunId, {
                    status: 'fail',
                    completedAt: new Date().toISOString(),
                    summary: `Navigation failed: ${navResult.error.message}`
                });
                return;
            }

            const previousActions: AgentAction[] = [];
            let stepNumber = 0;
            let completed = false;
            let finalSummary = '';

            // Agent loop
            while (stepNumber < maxSteps && !completed) {
                // Check State Machine
                if (controller.state === TestRunState.CANCELLED) {
                    this.logger.info('Test run cancelled by user');
                    yield { type: 'cancelled' };
                    await this.persistence.updateTestRun(testRunId, {
                        status: 'fail',
                        completedAt: new Date().toISOString(),
                        summary: 'Test run cancelled by user'
                    });
                    return;
                }

                if (controller.state === TestRunState.PAUSED) {
                    this.logger.info('Test run paused');
                    yield { type: 'paused' };
                    await controller.waitForResume();

                    // TS Narrowing bypass: state changed during await
                    if ((controller.state as TestRunState) === TestRunState.CANCELLED) continue;

                    this.logger.info('Test run resumed');
                    yield { type: 'resumed' };
                }

                stepNumber++;
                // stepNumber++; // Removed double increment bug
                this.logger.info(`Starting step ${stepNumber}`);

                yield { type: 'observing' };
                const snapshotResult = await this.browser.snapshot();
                if (snapshotResult.isErr()) {
                    this.logger.error('Snapshot failed', snapshotResult.error);
                    yield { type: 'error', error: snapshotResult.error };
                    break;
                }
                const snapshot = snapshotResult.value;

                const screenshotResult = await this.browser.screenshot();
                let screenshotPath: string | undefined;

                if (screenshotResult.isOk()) {
                    const base64 = screenshotResult.value.data.toString('base64');
                    yield { type: 'screenshot', data: base64 };
                    await this.artifacts.saveScreenshot(testRunId, stepNumber, screenshotResult.value.data);
                }

                const viewport = await this.browser.getViewportSize();

                const context: LLMContext = {
                    goal: testInput.prompt,
                    currentUrl: snapshot.url,
                    pageTitle: snapshot.title,
                    snapshot,
                    previousActions,
                    stepsRemaining: maxSteps - stepNumber,
                    viewport,
                };

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

                yield { type: 'acting', action };

                const step: TestStep = TestStepFactory.create({ stepNumber, action });

                const stepData: PersistenceTestStep = {
                    id: step.id,
                    testRunId: testRunId,
                    stepNumber: stepNumber,
                    actionType: action.type,
                    actionPayload: action,
                    timestamp: new Date().toISOString()
                };
                if (screenshotPath) {
                    stepData.screenshotPath = screenshotPath;
                }

                await this.persistence.saveTestStep(stepData);

                if (isTerminalAction(action)) {
                    completed = true;
                    finalSummary = action.type === 'pass' ? action.summary : action.reason;
                    this.logger.info(`Terminal action reached: ${action.type}`, { summary: finalSummary });
                } else {
                    this.logger.debug('Looking up tool for action', { actionType: action.type });

                    const tool = this.toolRegistry.get(action.type);
                    if (!tool) {
                        const error = new InteractionError(`No tool found for action type: ${action.type}`);
                        this.logger.error('Tool execution failed', error);
                        yield { type: 'error', error };
                        break;
                    }

                    const toolContext: ToolContext = {
                        browser: this.browser,
                        logger: this.logger,
                        controller
                    };

                    const result = await tool.execute(action, toolContext);

                    if (result.isErr()) {
                        this.logger.error('Tool execution failed', result.error);
                        const wrappedError = new InteractionError(`Tool execution failed: ${result.error.message}`);
                        yield { type: 'error', error: wrappedError };
                        break;
                    }

                    this.logger.debug('Waiting for DOM to stabilize');
                    await this.browser.waitForDOMStable();
                }

                const finalStep = completed
                    ? (action.type === 'pass'
                        ? TestStepFactory.markSuccess(step, screenshotPath ? ArtifactPathFactory.create(screenshotPath) : null, 0)
                        : TestStepFactory.markFailed(step, finalSummary, 0))
                    : TestStepFactory.markSuccess(step, screenshotPath ? ArtifactPathFactory.create(screenshotPath) : null, 0);

                yield { type: 'step_complete', step: finalStep };
            }

            const success = completed && previousActions.some(a => a.type === 'pass');
            this.logger.info(`Test run complete. Success: ${success}`);

            await this.persistence.updateTestRun(testRunId, {
                status: success ? 'pass' : 'fail',
                completedAt: new Date().toISOString(),
                summary: finalSummary || (success ? 'Test completed successfully' : 'Agent stopped without reaching a conclusion')
            });

            yield {
                type: 'completed',
                success,
                summary: finalSummary || (success ? 'Test completed successfully' : 'Agent stopped without reaching a conclusion (Max steps reached or manual stop)'),
            };

        } finally {
            this.logger.debug('Closing browser');
            await this.browser.close();
            controller.stop(); // Ensure controller state is cleaned up
        }
    }
}
