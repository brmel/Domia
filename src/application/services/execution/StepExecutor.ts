import { injectable, inject } from 'tsyringe';
import type { ILLMProvider, IBrowserAutomation, LLMContext, IPerceptionPipeline, IStorageService, ITraceService } from '@domain/ports';
import { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LoopDetectorService } from './LoopDetectorService';
import { AssertionGoalService } from '../assertion/AssertionGoalService';
import { ToolContractService } from '../tooling/ToolContractService';
import type { ToolContext } from '@domain/tools/Tool';
import type { ToolExecutor } from '../tooling/ToolExecutor';

export type StepExecutionResult =
    | { readonly success: true; readonly terminal: 'pass' }
    | {
        readonly success: false;
        readonly terminal: 'fail' | 'error' | 'max_actions';
        readonly code:
        | 'assertion_fail'
        | 'perception_error'
        | 'llm_error'
        | 'loop_detected'
        | 'action_execution_error'
        | 'agent_fail'
        | 'max_actions_reached';
        readonly reason: string;
    };

@injectable()
export class StepExecutor {
    constructor(
        @inject('ILLMProvider') private llmProvider: ILLMProvider,
        @inject(LoopDetectorService) private loopDetector: LoopDetectorService,
        @inject('IPerceptionPipeline') private perception: IPerceptionPipeline,
        @inject('IStorageService') private storage: IStorageService,
        @inject('ITraceService') private trace: ITraceService,
        @inject(AssertionGoalService) private readonly assertionGoalService: AssertionGoalService,
        @inject(ToolContractService) private readonly toolContractService: ToolContractService,
        @inject('IToolExecutor') private readonly toolExecutor: ToolExecutor
    ) { }

    async *executeStep(
        runId: string,
        stepGoal: string,
        browser: IBrowserAutomation,
        url: string,
        initialStepNumber: number = 0,
        options: { vision: boolean; debugScreenshots: boolean; maxActions: number } = { vision: true, debugScreenshots: false, maxActions: 20 },
        executionContext?: { toolContext?: ToolContext }
    ): AsyncGenerator<AgentAction | { type: 'action', action: AgentAction, assets?: Record<string, string> }, StepExecutionResult, unknown> {
        let loopCount = 0;
        let currentState: { history: AgentAction[], stepNumber: number } = { history: [], stepNumber: initialStepNumber };
        const maxActions = options.maxActions;

        await this.trace.startTrace(runId);

        while (loopCount < maxActions) {
            // Perception
            // Capture if either Vision (LLM) or DebugScreenshots is enabled
            const shouldCaptureVision = options.vision || options.debugScreenshots;
            const frameResult = await this.perception.capture(browser, { vision: shouldCaptureVision, aria: true, dom: true });
            if (frameResult.isErr()) {
                return {
                    success: false,
                    terminal: 'error',
                    code: 'perception_error',
                    reason: `Perception failed: ${frameResult.error.message}`
                };
            }
            const frame = frameResult.value;

            const assets = await this.storage.savePerceptionAssets(runId, currentState.stepNumber + 1, frame);

            // Trace: Perception Metadata
            await this.trace.tracePerception(runId, currentState.stepNumber + 1, {
                timestamp: Date.now(),
                sensorData: {
                    domCount: frame.semantic.dom ? 1 : 0, // Simplified for now
                    ariaPresent: !!frame.semantic.accessibility,
                    visionPresent: frame.vision.count > 0,
                    metadata: frame.metadata
                }
            });

            const viewport = await browser.getViewportSize();

            const snapshot: import('@domain/value-objects').DOMSnapshot = {
                ...frame.semantic.dom,
                screenshot: options.vision && frame.vision.primaryScreenshot ? frame.vision.primaryScreenshot.toString('base64') : undefined,
                screenshots: options.vision ? frame.vision.screenshots.map(b => b.toString('base64')) : [],
                accessibilityTree: frame.semantic.accessibility
            };

            const deterministicAction = this.assertionGoalService.evaluate(stepGoal, snapshot);
            if (deterministicAction) {
                await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                    agentOutput: {
                        thought: deterministicAction.thought || '',
                        action: deterministicAction,
                        rawResponse: 'deterministic-assertion-evaluator'
                    }
                });

                yield { type: 'action', action: deterministicAction, assets };

                if (deterministicAction.type === ActionType.PASS) {
                    return { success: true, terminal: 'pass' };
                }

                if (deterministicAction.type === ActionType.FAIL) {
                    return {
                        success: false,
                        terminal: 'fail',
                        code: 'assertion_fail',
                        reason: deterministicAction.reason
                    };
                }
            }

            const context: LLMContext = {
                goal: stepGoal,
                snapshot,
                previousActions: currentState.history,
                currentUrl: url,
                pageTitle: frame.metadata.title,
                viewport,
                stepsRemaining: maxActions - loopCount,
                availableTools: this.toolContractService.getToolDescriptors()
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
                return {
                    success: false,
                    terminal: 'error',
                    code: 'llm_error',
                    reason: `LLM failed: ${actionResult.error.message}`
                };
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
                return {
                    success: false,
                    terminal: 'error',
                    code: 'loop_detected',
                    reason: `Loop detected. Action '${action.type}' repeated too many times.`
                };
            }

            yield { type: 'action', action, assets };

            const execResult = await this.toolExecutor.execute(action, {
                browser,
                currentUrl: url,
                ...(executionContext?.toolContext ? { toolContext: executionContext.toolContext } : {})
            });
            if (execResult.isErr()) {
                return {
                    success: false,
                    terminal: 'error',
                    code: 'action_execution_error',
                    reason: `Action execution failed: ${execResult.error.message}`
                };
            }

            currentState = {
                ...currentState,
                history: [...currentState.history, action],
                stepNumber: currentState.stepNumber + 1
            };
            loopCount++;

            if (action.type === ActionType.PASS) {
                return { success: true, terminal: 'pass' };
            }
            if (action.type === ActionType.FAIL) {
                return {
                    success: false,
                    terminal: 'fail',
                    code: 'agent_fail',
                    reason: action.reason
                };
            }
        }

        return {
            success: false,
            terminal: 'max_actions',
            code: 'max_actions_reached',
            reason: `Max actions (${maxActions}) reached for step: ${stepGoal}`
        };
    }
}
