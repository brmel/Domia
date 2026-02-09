
import { injectable, inject } from 'tsyringe';
import { DomiaGateway } from '../gateway/DomiaGateway';
import type { ILLMProvider, IBrowserAutomation, LLMContext } from '../../domain/ports';
import { AgentAction, WorkflowState, UrlFactory } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';

@injectable()
export class RunTestUseCase {
    constructor(
        @inject(DomiaGateway) private gateway: DomiaGateway,
        @inject('ILLMProvider') private llmProvider: ILLMProvider,
        @inject(TestRunLifecycleManager) private lifecycleManager: TestRunLifecycleManager
    ) { }

    async *execute(input: RunTestInput, controller: ExecutionController): AsyncGenerator<RunTestOutput, void, unknown> {
        // Initialize Test Run
        const initResult = await this.lifecycleManager.initializeTestRun(input.url, input.prompt);
        if (initResult.isErr()) {
            yield { type: 'error', error: initResult.error };
            return;
        }
        const testRunId = initResult.value;
        yield { type: 'started', testRunId };

        // Allocate Session (Node)
        let node;
        let browser: IBrowserAutomation | undefined;
        try {
            node = await this.gateway.allocateSession(testRunId);
            const browserResult = await node.allocate();
            if (browserResult.isErr()) {
                throw new WorkflowError(`Failed to allocate browser: ${browserResult.error.message}`);
            }
            browser = browserResult.value;
            await browser.launch({ headless: input.options?.headless ?? true });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            yield { type: 'error', error: new WorkflowError(`Error initializing session: ${err.message}`) };
            // Cleanup if node was allocated but browser fail
            if (node && !browser) await this.gateway.releaseSession(testRunId);
            return;
        }

        // Initialize State
        let currentState = WorkflowState.initial();
        let completed = false;
        let finalSummary: string | undefined;

        try {
            const urlResult = UrlFactory.create(input.url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);
            const navResult = await browser.navigateTo(urlResult.value);
            if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);

            // Execute Workflow Loop
            while (!completed && !controller.isStopped()) {
                // Pause handling
                if (controller.state === 'paused') {
                    await controller.waitForResume();
                }

                if (controller.state === 'cancelled') {
                    break;
                }

                // Perception
                yield { type: 'observing' };
                const snapshotResult = await browser.snapshot();
                if (snapshotResult.isErr()) {
                    throw new WorkflowError(`Snapshot failed: ${snapshotResult.error.message}`);
                }
                const snapshot = snapshotResult.value;

                // Planning (LLM)
                yield { type: 'thinking' };

                const viewport = await browser.getViewportSize();
                const context: LLMContext = {
                    goal: input.prompt,
                    snapshot,
                    previousActions: currentState.history,
                    currentUrl: input.url,
                    pageTitle: 'Page',
                    viewport,
                    stepsRemaining: (input.options?.maxSteps || 20) - currentState.stepNumber,
                    ...(currentState.plan ? { plan: currentState.plan } : {})
                };

                const llmResult = await this.llmProvider.generateAction(context);
                if (llmResult.isErr()) {
                    throw new WorkflowError(`LLM generation failed: ${llmResult.error.message}`);
                }
                const action = llmResult.value;

                // Action Execution
                yield { type: 'acting', action };

                // Update History
                const newHistory = [...currentState.history, action];

                if (action.type === 'pass') {
                    completed = true;
                    finalSummary = action.summary;
                } else if (action.type === 'fail') {
                    completed = true;
                    finalSummary = action.reason;
                    throw new WorkflowError(action.reason);
                } else {
                    await this.executeAction(browser, action);
                }

                // Update State (Immutable update)
                currentState = {
                    ...currentState,
                    stepNumber: currentState.stepNumber + 1,
                    history: newHistory
                };

                yield { type: 'step_complete', stepNumber: currentState.stepNumber };

                if (currentState.stepNumber >= (input.options?.maxSteps || 20)) {
                    completed = true;
                    finalSummary = "Max steps reached without conclusion.";
                }
            }

            // Finalize
            if (controller.state === 'cancelled') {
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else {
                const success = !!completed && !finalSummary?.includes("Max steps") && !finalSummary?.includes("fail");
                yield { type: 'completed', success, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, success, finalSummary);
            }

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            yield { type: 'error', error: error instanceof Error ? error : new Error(msg) };
            await this.lifecycleManager.failTestRun(testRunId, msg);
        } finally {
            if (browser) await browser.close();
            await this.gateway.releaseSession(testRunId);
        }
    }

    private async executeAction(browser: IBrowserAutomation, action: AgentAction): Promise<void> {
        switch (action.type) {
            case 'click':
                (await browser.click(action.elementId)).mapErr(e => { throw new WorkflowError(e.message) });
                break;
            case 'type':
                (await browser.type(action.elementId, action.text)).mapErr(e => { throw new WorkflowError(e.message) });
                if (action.submit) {
                    (await browser.pressKey('Enter')).mapErr(e => { throw new WorkflowError(e.message) });
                }
                break;
            case 'pressKey':
                (await browser.pressKey(action.key)).mapErr(e => { throw new WorkflowError(e.message) });
                break;
            case 'scroll':
                (await browser.scroll(action.direction)).mapErr(e => { throw new WorkflowError(e.message) });
                break;
            case 'wait':
                (await browser.wait(action.durationMs)).mapErr(e => { throw new WorkflowError(e.message) });
                break;
            case 'navigate': {
                const navUrlResult = UrlFactory.create(action.url);
                if (navUrlResult.isErr()) throw new WorkflowError(`Invalid action URL: ${navUrlResult.error.message}`);
                (await browser.navigateTo(navUrlResult.value)).mapErr(e => { throw new WorkflowError(e.message) });
                break;
            }
            case 'extract':
                // Extraction results usually need to be fed back or stored. For now just executing.
                (await browser.extractText(action.elementId)).mapErr(e => { throw new WorkflowError(e.message) });
                break;
        }
    }
}
