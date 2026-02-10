import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import type { ILLMProvider, IBrowserAutomation, LLMContext } from '@domain/ports';
import { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LoopDetectorService } from './LoopDetectorService';
import { UrlFactory } from '@domain/value-objects';

@injectable()
export class StepExecutor {
    constructor(
        @inject('ILLMProvider') private llmProvider: ILLMProvider,
        @inject(LoopDetectorService) private loopDetector: LoopDetectorService,
        @inject('IPerceptionPipeline') private perception: import('@domain/ports/IPerceptionPipeline').IPerceptionPipeline,
        @inject('IStorageService') private storage: import('@domain/ports/IStorageService').IStorageService,
        @inject('ITraceService') private trace: import('@domain/ports/ITraceService').ITraceService
    ) { }

    async *executeStep(
        runId: string,
        stepGoal: string,
        browser: IBrowserAutomation,
        url: string,
        initialStepNumber: number = 0,
        options: { vision: boolean; debugScreenshots: boolean; maxActions: number } = { vision: true, debugScreenshots: false, maxActions: 20 }
    ): AsyncGenerator<AgentAction | { type: 'action', action: AgentAction, assets?: Record<string, string> }, Result<void, Error>, unknown> {
        let loopCount = 0;
        let currentState: { history: AgentAction[], stepNumber: number } = { history: [], stepNumber: initialStepNumber };
        const maxActions = options.maxActions;

        await this.trace.startTrace(runId);

        while (loopCount < maxActions) {
            // Perception
            // Capture if either Vision (LLM) or DebugScreenshots is enabled
            const shouldCaptureVision = options.vision || options.debugScreenshots;
            const frameResult = await this.perception.capture({ vision: shouldCaptureVision, aria: true, dom: true });
            if (frameResult.isErr()) return err(new Error(`Perception failed: ${frameResult.error.message}`));
            const frame = frameResult.value;

            // Save Assets
            // We use standard storage pathing. Actions are usually 1-to-1 with perception in this loop?
            // stepNumber in WorkflowState is monotonic.
            const assets = await this.storage.savePerceptionAssets(runId, currentState.stepNumber + 1, frame);

            // Trace: Perception Metadata
            await this.trace.tracePerception(runId, currentState.stepNumber + 1, {
                timestamp: Date.now(),
                sensorData: {
                    domCount: frame.semantic.dom ? 1 : 0, // Simplified for now
                    ariaPresent: !!frame.semantic.accessibility,
                    visionPresent: !!frame.vision.screenshot && frame.vision.screenshot.length > 0,
                    metadata: frame.metadata
                }
            });

            const viewport = await browser.getViewportSize();

            // Map Frame to DOMSnapshot for LLM (Legacy compatibility)
            // ONLY include screenshot if Vision is enabled for LLM
            const snapshot: import('@domain/value-objects').DOMSnapshot = {
                ...frame.semantic.dom,
                screenshot: options.vision ? frame.vision.screenshot.toString('base64') : undefined,
                accessibilityTree: frame.semantic.accessibility
            };

            const context: LLMContext = {
                goal: stepGoal,
                snapshot,
                previousActions: currentState.history,
                currentUrl: url,
                pageTitle: frame.metadata.title,
                viewport,
                stepsRemaining: maxActions - loopCount
            };

            // Trace: Agent Input (Prompt Context)
            await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                agentInput: {
                    goal: stepGoal,
                    currentUrl: url,
                    promptPreview: JSON.stringify(context).substring(0, 500) + '...'
                }
            });

            const actionResult = await this.llmProvider.generateAction(context);
            if (actionResult.isErr()) {
                await this.trace.traceReasoning(runId, currentState.stepNumber, {
                    agentOutput: { thought: 'LLM Failed', action: null, rawResponse: actionResult.error.message }
                });
                return err(new Error(`LLM failed: ${actionResult.error.message}`));
            }
            const action = actionResult.value;

            // Trace: Agent Output
            await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                agentOutput: {
                    thought: action.thought || '',
                    action: action,
                    rawResponse: JSON.stringify(action)
                }
            });

            if (this.loopDetector.isLoop(currentState.history, action)) {
                return err(new Error(`Loop detected. Action '${action.type}' repeated too many times.`));
            }

            yield { type: 'action', action, assets };

            const execResult = await this.executeAction(browser, action);
            if (execResult.isErr()) return err(new Error(`Action execution failed: ${execResult.error.message}`));

            currentState = {
                ...currentState,
                history: [...currentState.history, action],
                stepNumber: currentState.stepNumber + 1
            };
            loopCount++;

            if (action.type === ActionType.PASS) {
                return ok(undefined);
            }
            if (action.type === ActionType.FAIL) {
                return err(new Error(action.reason));
            }
        }

        return err(new Error(`Max actions (${maxActions}) reached for step: ${stepGoal}`));
    }

    private async executeAction(browser: IBrowserAutomation, action: AgentAction): Promise<Result<void, Error>> {
        try {
            switch (action.type) {
                case ActionType.CLICK:
                    (await browser.click(action.elementId)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.TYPE:
                    (await browser.type(action.elementId, action.text)).mapErr(e => { throw new Error(e.message) });
                    if (action.submit) {
                        (await browser.pressKey('Enter')).mapErr(e => { throw new Error(e.message) });
                    }
                    break;
                case ActionType.PRESS_KEY:
                    (await browser.pressKey(action.key)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.SCROLL:
                    (await browser.scroll(action.direction)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.WAIT:
                    (await browser.wait(action.durationMs)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.NAVIGATE: {
                    const navUrlResult = UrlFactory.create(action.url);
                    if (navUrlResult.isErr()) throw new Error(`Invalid URL: ${navUrlResult.error.message}`);
                    (await browser.navigateTo(navUrlResult.value)).mapErr(e => { throw new Error(e.message) });
                    break;
                }
                case ActionType.EXTRACT:
                    (await browser.extractText(action.elementId)).mapErr(e => { throw new Error(e.message) });
                    break;
            }
            return ok(undefined);
        } catch (e: unknown) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }
}
