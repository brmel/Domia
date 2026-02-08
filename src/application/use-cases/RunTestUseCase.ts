import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, ILLMProvider, ILogger, IPersistenceAdapter } from '@domain/ports';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, Url } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';
import { TestStepFactory } from '@domain/entities';
import { isTerminalAction } from '@domain/value-objects/AgentAction';
import { TestRunIdFactory } from '@domain/value-objects';
import type { TestInput } from '../../shared/validation';
import { ExecutionController } from '../controllers/ExecutionController';
import { TestRunState } from '../../domain/enums/TestRunState';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { SnapshotService } from '../services/SnapshotService';
import { ActionPerformer } from '../services/ActionPerformer';

const DEFAULT_MAX_STEPS = 20;

@injectable()
export class RunTestUseCase {
    constructor(
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('ILLMProvider') private readonly llm: ILLMProvider,
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject(TestRunLifecycleManager) private readonly lifecycle: TestRunLifecycleManager,
        @inject(SnapshotService) private readonly snapshotService: SnapshotService,
        @inject(ActionPerformer) private readonly performer: ActionPerformer
    ) { }

    async *execute(
        input: TestInput,
        controller: ExecutionController
    ): AsyncGenerator<TestRunEvent, void, undefined> {
        this.logger.info('Starting test run execution');

        const testInput = input;
        const maxSteps = testInput.options?.maxSteps ?? DEFAULT_MAX_STEPS;
        const testRunId = TestRunIdFactory.create();

        await this.lifecycle.initialize(testRunId, testInput.url, testInput.prompt);

        controller.start();
        yield { type: 'started', testRunId };

        this.logger.debug('Launching browser');
        const launchResult = await this.browser.launch({
            headless: testInput.options?.headless ?? true,
        });
        if (launchResult.isErr()) {
            yield { type: 'error', error: launchResult.error };
            await this.lifecycle.fail(testRunId, `Browser launch failed: ${launchResult.error.message}`);
            return;
        }

        try {
            this.logger.debug(`Navigating to ${testInput.url}`);
            const navResult = await this.browser.navigateTo(testInput.url as Url);
            if (navResult.isErr()) {
                yield { type: 'error', error: navResult.error };
                await this.lifecycle.fail(testRunId, `Navigation failed: ${navResult.error.message}`);
                return;
            }

            const previousActions: AgentAction[] = [];
            let stepNumber = 0;
            let completed = false;
            let finalSummary = '';

            // Agent loop
            while (stepNumber < maxSteps && !completed) {
                if (controller.state === TestRunState.CANCELLED) {
                    this.logger.info('Test run cancelled by user');
                    yield { type: 'cancelled' };
                    await this.lifecycle.fail(testRunId, 'Test run cancelled by user');
                    return;
                }

                if (controller.state === TestRunState.PAUSED) {
                    this.logger.info('Test run paused');
                    yield { type: 'paused' };
                    await controller.waitForResume();
                    if ((controller.state as TestRunState) === TestRunState.CANCELLED) continue;
                    this.logger.info('Test run resumed');
                    yield { type: 'resumed' };
                }

                stepNumber++;
                this.logger.info(`Starting step ${stepNumber}`);

                yield { type: 'observing' };
                const snapshotResult = await this.snapshotService.capture(stepNumber, testInput.prompt, previousActions, maxSteps);
                if (snapshotResult.isErr()) {
                    yield { type: 'error', error: snapshotResult.error };
                    break;
                }
                const { context } = snapshotResult.value;

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
                await this.saveStep(testRunId, step, action);

                if (isTerminalAction(action)) {
                    completed = true;
                    finalSummary = action.type === 'pass' ? action.summary : action.reason;
                    this.logger.info(`Terminal action reached: ${action.type}`, { summary: finalSummary });
                } else {
                    const toolResult = await this.performer.perform(action, controller);
                    if (toolResult.isErr()) {
                        yield { type: 'error', error: toolResult.error };
                        break;
                    }
                    this.logger.debug('Waiting for DOM to stabilize');
                    await this.browser.waitForDOMStable();
                }

                const finalStep = this.createFinalStep(step, completed, action, finalSummary);
                yield { type: 'step_complete', step: finalStep };
            }

            const success = completed && previousActions.some(a => a.type === 'pass');
            await this.lifecycle.finalize(testRunId, success, finalSummary);

            yield {
                type: 'completed',
                success,
                summary: finalSummary || (success ? 'Test completed successfully' : 'Agent stopped without reaching a conclusion (Max steps reached or manual stop)'),
            };

        } finally {
            this.logger.debug('Closing browser');
            await this.browser.close();
            controller.stop();
        }
    }

    private async saveStep(testRunId: string, step: TestStep, action: AgentAction): Promise<void> {
        await this.persistence.saveTestStep({
            id: step.id,
            testRunId: testRunId,
            stepNumber: step.stepNumber,
            actionType: action.type,
            actionPayload: action,
            timestamp: new Date().toISOString()
        });
    }

    private createFinalStep(step: TestStep, completed: boolean, action: AgentAction, summary?: string): TestStep {
        const artifact = null;
        if (completed) {
            return action.type === 'pass'
                ? TestStepFactory.markSuccess(step, artifact, 0)
                : TestStepFactory.markFailed(step, summary || 'Failed', 0);
        }
        return TestStepFactory.markSuccess(step, artifact, 0);
    }
}
