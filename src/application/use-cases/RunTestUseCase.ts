
import { injectable, inject } from 'tsyringe';
import { DomiaGateway } from '../gateway/DomiaGateway';
import { IBrowserAutomation } from '../../domain/ports';
import { UrlFactory, WorkflowState } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';
import { TestRunState } from '../../domain/enums/TestRunState';
import { WorkflowPlanner } from '../services/planning/WorkflowPlanner';
import { StepExecutor } from '../services/execution/StepExecutor';
import { PlanItemStatus } from '@domain/entities/Plan';


@injectable()
export class RunTestUseCase {
    constructor(
        @inject(DomiaGateway) private gateway: DomiaGateway,
        @inject(TestRunLifecycleManager) private lifecycleManager: TestRunLifecycleManager,
        @inject(WorkflowPlanner) private planner: WorkflowPlanner,
        @inject(StepExecutor) private executor: StepExecutor
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

            yield { type: 'thinking' }; // Loading state

            const navResult = await browser.navigateTo(urlResult.value);
            if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);

            // 1. Planning Phase
            yield { type: 'thinking' };
            const planResult = await this.planner.plan(input.prompt);

            if (planResult.isErr()) {
                // Fallback to unstructured execution if planning fails? 
                // For now, let's treat it as a hard failure or maybe just log and proceed without plan?
                // The requirement is to refactor TO hierarchical workflow, so let's fail if plan fails.
                throw new WorkflowError(`Planning failed: ${planResult.error.message}`);
            }

            const plan = planResult.value;
            currentState = { ...currentState, plan };
            yield { type: 'state_updated', state: currentState };

            // 2. Execution Phase
            for (let i = 0; i < plan.items.length; i++) {
                const item = plan.items[i];
                if (!item) continue;

                // Check Pause/Cancel
                if (controller.state === TestRunState.PAUSED) {
                    await controller.waitForResume();
                }
                if (controller.state === TestRunState.CANCELLED) {
                    break;
                }

                // Update Item Status to Running
                const runningItem = { ...item, status: 'active' as PlanItemStatus } as import('@domain/entities/Plan').PlanItem;
                const updatedItems = [...plan.items];
                updatedItems[i] = runningItem;
                currentState = { ...currentState, plan: { ...plan, items: updatedItems } };
                yield { type: 'state_updated', state: currentState };


                // Execute Item
                // We define executing a plan item as executing a "step" in StepExecutor
                const stepGen = this.executor.executeStep(item.description, browser, input.url);
                let result: import('neverthrow').Result<void, Error> | undefined;

                // Manual iteration to capture both yielded events and return value
                const iterator = stepGen[Symbol.asyncIterator]();
                let next = await iterator.next();
                while (!next.done) {
                    if (next.value.type === 'action') {
                        yield { type: 'acting', action: next.value.action };
                    } else if (next.value.type === 'thought') {
                        // Optional: yield thought events if RunTestOutput supports it
                        // For now we ignore or log?
                        // yield { type: 'thinking', text: next.value.text }; // parsing error if not supported
                    }
                    next = await iterator.next();
                }
                result = next.value; // This is the return value (Result<void, Error>)

                if (result && result.isOk()) {
                    // Mark Success
                    const successItem = { ...item, status: 'completed' as PlanItemStatus } as import('@domain/entities/Plan').PlanItem;
                    const successItems = [...updatedItems];
                    successItems[i] = successItem;
                    currentState = { ...currentState, plan: { ...plan, items: successItems } };
                    yield { type: 'state_updated', state: currentState };
                } else {
                    // Mark Fail
                    const errorMsg = result ? result.error.message : "Unknown error";
                    const failItem = { ...item, status: 'failed' as PlanItemStatus, error: errorMsg } as import('@domain/entities/Plan').PlanItem;
                    const failItems = [...updatedItems];
                    failItems[i] = failItem;
                    currentState = { ...currentState, plan: { ...plan, items: failItems } };
                    yield { type: 'state_updated', state: currentState };

                    if (result) throw result.error;
                    else throw new Error("Step execution failed without result");
                }
            }

            completed = true;
            finalSummary = "Test completed successfully.";

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            yield { type: 'error', error: error instanceof Error ? error : new Error(msg) };
            await this.lifecycleManager.failTestRun(testRunId, msg);
        } finally {
            if (browser) await browser.close();
            await this.gateway.releaseSession(testRunId);

            // Final status update
            if (controller.state === TestRunState.CANCELLED) {
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else if (completed) {
                yield { type: 'completed', success: true, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, true, finalSummary);
            }
        }
    }
}
