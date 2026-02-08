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
import { DomiaGateway } from '../gateway/DomiaGateway';
import { WorkflowEngine } from '../workflows/WorkflowEngine';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { INode } from '@domain/ports';
import { DomainError } from '@domain/errors';

const DEFAULT_MAX_STEPS = 20;

class WorkflowError extends DomainError {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

@injectable()
export class RunTestUseCase {
    constructor(
        // @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation, // Removed direct browser dependency
        @inject(DomiaGateway) private readonly gateway: DomiaGateway,
        @inject(WorkflowEngine) private readonly workflowEngine: WorkflowEngine,
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
        this.logger.info('Starting test run execution with Durable Workflow Engine');

        const testInput = input;
        const maxSteps = testInput.options?.maxSteps ?? DEFAULT_MAX_STEPS;
        const testRunId = TestRunIdFactory.create();

        // 1. Initialize Lifecycle
        await this.lifecycle.initialize(testRunId, testInput.url, testInput.prompt);
        controller.start();
        yield { type: 'started', testRunId };

        // 2. Allocate Session via Gateway
        let node: INode;
        let browser: IBrowserAutomation;
        try {
            this.logger.debug(`Allocating session for ${testRunId}`);
            node = await this.gateway.allocateSession(testRunId);
            const browserResult = await node.allocate();
            if (browserResult.isErr()) throw browserResult.error;
            browser = browserResult.value;

            this.logger.debug(`Launching browser with options: ${JSON.stringify(testInput.options)}`);
            const launchOptions = {
                ...testInput.options,
                headless: testInput.options?.headless ?? true
            };
            const launchResult = await browser.launch(launchOptions);
            if (launchResult.isErr()) throw launchResult.error;
        } catch (error) {
            const domainError = new WorkflowError('BROWSER_LAUNCH_FAILED', String(error));
            yield { type: 'error', error: domainError };
            await this.lifecycle.fail(testRunId, `Browser launch failed: ${domainError.message}`);
            return;
        }

        // 3. Navigate
        const navResult = await browser.navigateTo(testInput.url as Url);
        if (navResult.isErr()) {
            const domainError = new WorkflowError('NAVIGATION_FAILED', navResult.error.message);
            yield { type: 'error', error: domainError };
            await this.lifecycle.fail(testRunId, `Navigation failed: ${domainError.message}`);
            await this.gateway.releaseSession(testRunId);
            return;
        }

        // 4. Initialize Workflow State
        const resumeResult = await this.workflowEngine.resume(testRunId);
        let currentState = resumeResult.isOk() && resumeResult.value ? resumeResult.value : WorkflowState.initial();

        // Loop
        const previousActions: AgentAction[] = []; // TODO: Load from persistence if resuming
        let finalSummary = '';
        let completed = false;

        try {
            while (currentState.stepNumber < maxSteps && !completed) {
                // Check Controller (Pause/Cancel)
                if (controller.state === TestRunState.CANCELLED) {
                    this.logger.info('Test run cancelled by user');
                    yield { type: 'cancelled' };
                    await this.lifecycle.fail(testRunId, 'Test run cancelled by user');
                    return;
                }

                if (controller.state === TestRunState.PAUSED) {
                    yield { type: 'paused' };
                    await controller.waitForResume();
                    if ((controller.state as TestRunState) === TestRunState.CANCELLED) continue;
                    yield { type: 'resumed' };
                }

                // State Transition: Planning -> Observing
                const observeTransition = await this.workflowEngine.transition(testRunId, currentState, 'observing');
                if (observeTransition.isErr()) throw observeTransition.error;
                currentState = observeTransition.value;

                yield { type: 'observing' };
                const observation = await this.snapshotService.perform(browser, testRunId, currentState.stepNumber, testInput.prompt, previousActions, maxSteps);
                if (observation.isErr()) {
                    yield { type: 'error', error: observation.error };
                    break;
                }
                const { context } = observation.value;

                // State Transition: Observing -> Thinking
                const thinkTransition = await this.workflowEngine.transition(testRunId, currentState, 'thinking');
                if (thinkTransition.isErr()) throw thinkTransition.error;
                currentState = thinkTransition.value;

                yield { type: 'thinking' };
                const actionResult = await this.llm.generateAction(context);
                if (actionResult.isErr()) {
                    yield { type: 'error', error: actionResult.error };
                    break;
                }
                const action = actionResult.value;
                previousActions.push(action);

                // State Transition: Thinking -> Acting
                const actTransition = await this.workflowEngine.transition(testRunId, currentState, 'acting');
                if (actTransition.isErr()) throw actTransition.error;
                currentState = actTransition.value;

                yield { type: 'acting', action };
                const step: TestStep = TestStepFactory.create({ stepNumber: currentState.stepNumber, action });
                await this.saveStep(testRunId, step, action);

                if (isTerminalAction(action)) {
                    completed = true;
                    finalSummary = action.type === 'pass' ? action.summary : action.reason;
                    // State Transition: Acting -> Completed
                    await this.workflowEngine.transition(testRunId, currentState, 'completed');
                } else {
                    const toolResult = await this.performer.perform(browser, action, controller);
                    if (toolResult.isErr()) {
                        const domainError = new WorkflowError('TOOL_EXECUTION_FAILED', toolResult.error.message);
                        yield { type: 'error', error: domainError };
                        break;
                    }
                    // State Transition: Acting -> Validating (Implicitly waiting for DOM)
                    await this.workflowEngine.transition(testRunId, currentState, 'validating');
                    await browser.waitForDOMStable();

                    // Prepare for next loop
                    // State Transition: Validating -> Planning
                    const planTransition = await this.workflowEngine.transition(testRunId, currentState, 'planning');
                    if (planTransition.isErr()) throw planTransition.error;
                    currentState = planTransition.value;
                }

                const finalStep = this.createFinalStep(step, completed, action, finalSummary);
                yield { type: 'step_complete', step: finalStep };
            }

            const success = completed && previousActions.some(a => a.type === 'pass');
            await this.lifecycle.finalize(testRunId, success, finalSummary);
            yield { type: 'completed', success, summary: finalSummary };

        } catch (error) {
            this.logger.error('Workflow error', error);
            const domainError = new WorkflowError('WORKFLOW_CRASH', String(error));
            yield { type: 'error', error: domainError };
            await this.lifecycle.fail(testRunId, `Workflow Error: ${domainError.message}`);
        } finally {
            this.logger.debug('Releasing session');
            await this.gateway.releaseSession(testRunId);
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
        if (completed) {
            return action.type === 'pass'
                ? TestStepFactory.markSuccess(step, 0)
                : TestStepFactory.markFailed(step, summary || 'Failed', 0);
        }
        return TestStepFactory.markSuccess(step, 0);
    }
}
