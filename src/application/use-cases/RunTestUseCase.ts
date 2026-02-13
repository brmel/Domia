
import { injectable, inject } from 'tsyringe';
import { IBrowserAutomation } from '../../domain/ports';
import { UrlFactory, WorkflowState } from '../../domain/value-objects';
import { ExecutionController } from '../controllers/ExecutionController';
import { WorkflowError } from '../../domain/errors';
import { TestRunLifecycleManager } from '../services/TestRunLifecycleManager';
import { RunTestInput, RunTestOutput } from '../dtos';
import { TestRunState } from '../../domain/enums/TestRunState';
import { WorkflowPlanner } from '../services/planning/WorkflowPlanner';
import { StepExecutor, type StepExecutionResult } from '../services/execution/StepExecutor';
import type { RunExecutionLaneService } from '../services/execution/RunExecutionLaneService';
import { PlanItemStatus } from '@domain/entities/Plan';
import { TestStep } from '../../domain/ports';
import { v4 as uuidv4 } from 'uuid';
import type { ILogger } from '../../domain/ports';
import { PlatformSessionFactory } from '../services/platform/PlatformSessionFactory';
import type { ToolContext } from '../../domain/tools/Tool';


@injectable()
export class RunTestUseCase {
    constructor(
        @inject(TestRunLifecycleManager) private lifecycleManager: TestRunLifecycleManager,
        @inject(WorkflowPlanner) private planner: WorkflowPlanner,
        @inject(StepExecutor) private executor: StepExecutor,
        @inject('IPersistenceAdapter') private persistence: import('../../domain/ports').IPersistenceAdapter,
        @inject('ITraceService') private trace: import('../../domain/ports/ITraceService').ITraceService,
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory,
        @inject('IRunExecutionLaneService') private readonly laneService: RunExecutionLaneService,
        @inject('ILogger') private logger: ILogger
    ) { }

    async *execute(input: RunTestInput, controller: ExecutionController): AsyncGenerator<RunTestOutput, void, unknown> {
        // Validate input: Either URL or platformConfig must be provided
        if (!input.url && !input.platformConfig) {
            yield { type: 'error', error: new WorkflowError('No platform configuration provided. Either provide url or platformConfig.') };
            return;
        }
        
        // Extract URL for test run initialization (legacy requirement)
        const url = input.platformConfig?.platform === 'web'
            ? input.platformConfig.url
            : input.platformConfig?.platform === 'electron' && input.platformConfig.connection.type === 'cdp'
                ? input.platformConfig.connection.cdpUrl
                : input.platformConfig?.platform === 'electron' && input.platformConfig.connection.type === 'executable'
                    ? 'electron://app'
                    : input.url;

        if (!url) {
            yield { type: 'error', error: new WorkflowError('Could not determine URL from input') };
            return;
        }

        const laneKey = this.resolveLaneKey(input, url);
        const releaseLane = await this.laneService.acquire(laneKey);

        const initResult = await this.lifecycleManager.initializeTestRun(url, input.prompt);
        if (initResult.isErr()) {
            releaseLane();
            yield { type: 'error', error: initResult.error };
            return;
        }
        const testRunId = initResult.value;
        yield { type: 'started', testRunId };

        let browser: IBrowserAutomation | undefined;
        let disposeSession: (() => Promise<void>) | undefined;
        let shouldNavigate = true;
        let stepToolContext: ToolContext | undefined;
        
        try {
            const session = await this.sessionFactory.createSession(input, testRunId);
            browser = session.browser;
            disposeSession = session.dispose;
            shouldNavigate = session.shouldNavigate;

            if (session.driver) {
                stepToolContext = {
                    browser,
                    driver: session.driver,
                    platform: session.driver.getCapabilities().platform,
                    logger: this.logger
                };
            }
            
            if (!browser) {
                throw new WorkflowError('Failed to initialize browser automation interface');
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            yield { type: 'error', error: new WorkflowError(`Error initializing session: ${err.message}`) };
            if (disposeSession) {
                await disposeSession();
            }
            releaseLane();
            return;
        }

        // Initialize State
        let currentState = WorkflowState.initial();
        let completed = false;
        let finalSummary: string | undefined;
        let hasVerificationFailure = false;
        let terminalError: Error | null = null;

        try {
            const urlResult = UrlFactory.create(url);
            if (urlResult.isErr()) throw new WorkflowError(`Invalid URL: ${urlResult.error.message}`);

            yield { type: 'thinking' }; // Loading state

            if (shouldNavigate) {
                const navResult = await browser.navigateTo(urlResult.value);
                if (navResult.isErr()) throw new WorkflowError(`Navigation failed: ${navResult.error.message}`);
            } else {
                await browser.waitForDOMStable();
            }

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

                const stepGen = this.executor.executeStep(
                    testRunId,
                    item.description,
                    browser,
                    url,
                    currentState.stepNumber,
                    executionOptions,
                    { ...(stepToolContext ? { toolContext: stepToolContext } : {}) }
                );
                let result: StepExecutionResult | undefined;

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
                    result = next.value;
                } catch (e) {
                    const iteratorError = e instanceof Error ? e : new Error(String(e));
                    result = {
                        success: false,
                        terminal: 'error',
                        code: 'action_execution_error',
                        reason: `Step iterator failed: ${iteratorError.message}`
                    };
                }

                if (result && result.success) {
                    // Mark Success
                    const successItem = { ...item, status: 'completed' as PlanItemStatus } as import('@domain/entities/Plan').PlanItem;
                    const successItems = [...updatedItems];
                    successItems[i] = successItem;
                    currentState = { ...currentState, plan: { ...plan, items: successItems } };
                    yield { type: 'state_updated', state: currentState };
                } else {
                    // Step Failed
                    const errorMsg = result ? `${result.code}: ${result.reason}` : 'unknown_error: Unknown error';

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
            terminalError = error instanceof Error ? error : new Error(msg);
        } finally {
            if (disposeSession) {
                await disposeSession().catch(err =>
                    this.logger.warn(`[RunTestUseCase] Error during session cleanup: ${String(err)}`)
                );
            }

            releaseLane();

            // Flush and finalize traces
            await this.trace.endTrace();

            // Final status update
            // Emit exactly one terminal event.
            if (terminalError) {
                yield { type: 'error', error: terminalError };
            } else if (controller.state === TestRunState.CANCELLED) {
                yield { type: 'completed', success: false, summary: "Test cancelled by user." };
                await this.lifecycleManager.finalizeTestRun(testRunId, false, "Test cancelled by user.");
            } else if (completed) {
                const isGlobalSuccess = !hasVerificationFailure;
                yield { type: 'completed', success: isGlobalSuccess, ...(finalSummary ? { summary: finalSummary } : {}) };
                await this.lifecycleManager.finalizeTestRun(testRunId, isGlobalSuccess, finalSummary);
            }
        }
    }

    private resolveLaneKey(input: RunTestInput, resolvedUrl: string): string {
        const platformConfig = input.platformConfig;
        const platform = platformConfig?.platform;

        if (!platformConfig) {
            return `legacy:web:${resolvedUrl}`;
        }

        if (platform === 'web') {
            return `platform:web:${platformConfig.url}`;
        }

        if (platform === 'electron') {
            if (platformConfig.connection.type === 'cdp') {
                return `platform:electron:cdp:${platformConfig.connection.cdpUrl}`;
            }

            return `platform:electron:executable:${platformConfig.connection.executablePath}`;
        }

        return `legacy:web:${resolvedUrl}`;
    }
}
