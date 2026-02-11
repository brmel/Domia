
import { injectable, inject } from 'tsyringe';
import { errAsync } from 'neverthrow';
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
import { TestStep } from '../../domain/ports';
import { v4 as uuidv4 } from 'uuid';


@injectable()
export class RunTestUseCase {
    constructor(
        @inject(DomiaGateway) private gateway: DomiaGateway,
        @inject(TestRunLifecycleManager) private lifecycleManager: TestRunLifecycleManager,
        @inject(WorkflowPlanner) private planner: WorkflowPlanner,
        @inject(StepExecutor) private executor: StepExecutor,
        @inject('IPersistenceAdapter') private persistence: import('../../domain/ports').IPersistenceAdapter,
        @inject('ITraceService') private trace: import('../../domain/ports/ITraceService').ITraceService
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
        let hasVerificationFailure = false;

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

                const executionOptions = {
                    vision: input.options?.vision ?? true,
                    debugScreenshots: input.options?.debugScreenshots ?? false,
                    maxActions: input.options?.maxSteps ?? 20
                };

                const stepGen = this.executor.executeStep(testRunId, item.description, browser, input.url, currentState.stepNumber, executionOptions);
                let result: import('neverthrow').Result<void, Error> | undefined;

                try {
                    const iterator = stepGen[Symbol.asyncIterator]();
                    let next = await iterator.next();
                    while (!next.done) {
                        if (next.value.type === 'action') {
                            const action = next.value.action;
                            const assets = next.value.assets; // These are paths from StepExecutor

                            const step: TestStep = {
                                id: uuidv4(),
                                testRunId,
                                stepNumber: currentState.stepNumber + 1,
                                actionType: action.type,
                                actionPayload: action,
                                ...(assets ? { assets } : {}),
                                timestamp: new Date().toISOString()
                            };

                            await this.persistence.saveTestStep(step);

                            // Update state
                            currentState = {
                                ...currentState,
                                stepNumber: currentState.stepNumber + 1,
                                history: [...currentState.history, action]
                            };
                            yield { type: 'state_updated', state: currentState };

                            yield { type: 'acting', action: next.value.action };
                        }
                        next = await iterator.next();
                    }
                    result = next.value; // This is the return value (Result<void, Error>)
                } catch (e) {
                    // Catch unexpected iterator errors
                    result = errAsync(e instanceof Error ? e : new Error(String(e))) as any; // Cast to match result type
                }

                if (result && result.isOk()) {
                    // Mark Success
                    const successItem = { ...item, status: 'completed' as PlanItemStatus } as import('@domain/entities/Plan').PlanItem;
                    const successItems = [...updatedItems];
                    successItems[i] = successItem;
                    currentState = { ...currentState, plan: { ...plan, items: successItems } };
                    yield { type: 'state_updated', state: currentState };
                } else {
                    // Step Failed
                    const errorMsg = result ? result.error.message : "Unknown error";

                    const completedWithFailureItem = { ...item, status: 'completed' as PlanItemStatus } as import('@domain/entities/Plan').PlanItem;
                    const newItems = [...updatedItems];
                    newItems[i] = completedWithFailureItem;
                    currentState = { ...currentState, plan: { ...plan, items: newItems } };
                    yield { type: 'state_updated', state: currentState };

                    console.warn(`[RunTestUseCase] Step failed verification: ${errorMsg}`);
                    finalSummary = `Verification failed: ${errorMsg}`;
                    hasVerificationFailure = true;
                    // We DO NOT throw here anymore. We continue execution or finish.
                    // Since this is likely the last step (verification), we just proceed.
                }
            }

            completed = true;
            if (!finalSummary) finalSummary = "Test completed successfully.";

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            await this.lifecycleManager.failTestRun(testRunId, msg);
            yield { type: 'error', error: error instanceof Error ? error : new Error(msg) };
        } finally {
            if (browser) await browser.close();
            await this.gateway.releaseSession(testRunId);

            // Flush and finalize traces
            await this.trace.endTrace();

            // Final status update
            // Global Status Logic: Fail if cancelled OR if hasVerificationFailure is true.
            if (controller.state === TestRunState.CANCELLED) {
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else if (completed) {
                const isGlobalSuccess = !hasVerificationFailure;
                yield { type: 'completed', success: isGlobalSuccess, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, isGlobalSuccess, finalSummary);
            }
        }
    }
}
