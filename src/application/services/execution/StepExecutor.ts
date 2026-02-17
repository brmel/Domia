import { injectable, inject } from 'tsyringe';
import type { ILLMProvider, IBrowserAutomation, LLMContext, IPerceptionPipeline, IStorageService, ITraceService } from '@domain/ports';
import { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LoopDetectorService } from './LoopDetectorService';
import { AssertionGoalService } from '../assertion/AssertionGoalService';
import { ToolContractService } from '../tooling/ToolContractService';
import type { ToolContext } from '@domain/tools/Tool';
import type { ToolExecutor } from '../tooling/ToolExecutor';
import type { ILogger } from '@domain/ports';
import { TemporalObservationPolicyService } from '../perception/TemporalObservationPolicyService';
import { TimelineContextAssembler } from '../perception/TimelineContextAssembler';
import type { SnapshotFrame, TimelineContextWindow } from '@domain/value-objects/TemporalObservation';
import type { TemporalObservationMode } from '../perception/TemporalObservationPolicyService';
import { TemporalContextSelectorService } from '../perception/TemporalContextSelectorService';
import { TemporalPrivacyFilterService } from '../perception/TemporalPrivacyFilterService';
import { TemporalPromptAssemblerService } from '../perception/TemporalPromptAssemblerService';
import { VerificationPolicyService } from './VerificationPolicyService';
import { EvidenceBlackboardService } from './EvidenceBlackboardService';
import type { VerificationPolicyProfile } from './coordinators/StepExecutionCoordinator';

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

export interface StepEvaluationTelemetry {
    readonly evaluation: LLMEvaluationDecision;
    readonly attemptedAction: AgentAction;
    readonly executionOutcome: 'executed' | 'execution_error' | 'not_executed';
    readonly executionError?: string;
}

export interface ActionOverrideProvider {
    consumeActionOverride(): AgentAction | undefined;
}

const MAX_HISTORY_CONTEXT_ACTIONS = 25;
const MAX_ADVICE_CONTEXT_CHARS = 600;
const TEMPORAL_STABLE_FRAME_STREAK = 2;

@injectable()
export class StepExecutor {
    private readonly verificationPolicy = new VerificationPolicyService();

    constructor(
        @inject('ILLMProvider') private llmProvider: ILLMProvider,
        @inject(LoopDetectorService) private loopDetector: LoopDetectorService,
        @inject('IPerceptionPipeline') private perception: IPerceptionPipeline,
        @inject('IStorageService') private storage: IStorageService,
        @inject('ITraceService') private trace: ITraceService,
        @inject(AssertionGoalService) private readonly assertionGoalService: AssertionGoalService,
        @inject(ToolContractService) private readonly toolContractService: ToolContractService,
        @inject('IToolExecutor') private readonly toolExecutor: ToolExecutor,
        @inject(TemporalObservationPolicyService) private readonly temporalPolicy: TemporalObservationPolicyService,
        @inject(TimelineContextAssembler) private readonly timelineAssembler: TimelineContextAssembler,
        @inject(TemporalContextSelectorService) private readonly temporalSelector: TemporalContextSelectorService,
        @inject(TemporalPrivacyFilterService) private readonly temporalPrivacyFilter: TemporalPrivacyFilterService,
        @inject(TemporalPromptAssemblerService) private readonly temporalPromptAssembler: TemporalPromptAssemblerService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(EvidenceBlackboardService) private readonly evidenceBlackboard: EvidenceBlackboardService = new EvidenceBlackboardService()
    ) { }

    async *executeStep(
        runId: string,
        stepGoal: string,
        browser: IBrowserAutomation,
        url: string,
        initialStepNumber: number = 0,
        options: {
            vision: boolean;
            debugScreenshots: boolean;
            maxActions: number;
            supervisedTerminalPass?: boolean;
            verificationPolicyProfile?: VerificationPolicyProfile;
            temporalObservation?: boolean;
            temporalMode?: TemporalObservationMode;
            temporalBurstFrames?: number;
            temporalBaselineIntervalMs?: number;
            temporalBurstIntervalMs?: number;
            temporalMaxFramesPerWindow?: number;
            temporalPromptTokenBudget?: number;
            temporalRedactSensitive?: boolean;
            temporalPersistWindow?: boolean;
        } = { vision: true, debugScreenshots: false, maxActions: 20, temporalObservation: false, temporalBurstFrames: 3 },
        executionContext?: {
            toolContext?: ToolContext;
            onEvaluation?: (telemetry: StepEvaluationTelemetry) => void | Promise<void>;
            overrideProvider?: ActionOverrideProvider;
        }
    ): AsyncGenerator<AgentAction | { type: 'action', action: AgentAction, assets?: Record<string, string> }, StepExecutionResult, unknown> {
        const verificationPolicyProfile = options.verificationPolicyProfile;
        const supervisedTerminalPass = verificationPolicyProfile?.enforceSupervisedTerminalPass ?? options.supervisedTerminalPass ?? true;
        const effectiveVerificationPolicyProfile = {
            ...(verificationPolicyProfile ?? {}),
            enforceSupervisedTerminalPass: supervisedTerminalPass
        };
        let loopCount = 0;
        let consecutiveScrollActions = 0;
        let stagnantSnapshotCount = 0;
        let previousSnapshotSignature: string | null = null;
        let adviceForNextAttempt: string | undefined;
        let consecutiveEvaluatorRetries = 0;
        let previousDomElementCount = 0;
        let currentState: { history: AgentAction[], stepNumber: number } = { history: [], stepNumber: initialStepNumber };
        const maxActions = options.maxActions;

        await this.trace.startTrace(runId);

        while (loopCount < maxActions) {
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
            const runtimeUrl = frame.metadata.url || url;

            const domElementCount = frame.semantic.dom?.elements?.length ?? 0;
            const domVelocity = previousDomElementCount > 0
                ? Math.min(1, Math.abs(domElementCount - previousDomElementCount) / previousDomElementCount)
                : 0;
            previousDomElementCount = domElementCount;

            const temporalWindow = await this.captureTemporalWindowIfEnabled(runId, browser, frame, options, {
                domVelocity,
                interactionInFlight: this.isInteractionLikelyInFlight(currentState.history),
                recentAssertionMismatch: consecutiveEvaluatorRetries > 0,
                recentExecutionError: adviceForNextAttempt ? /error|failed|timeout|blocked/i.test(adviceForNextAttempt) : false,
                stagnantCycles: stagnantSnapshotCount
            });

            let assets: Record<string, string> = {};
            try {
                assets = await this.storage.savePerceptionAssets(runId, currentState.stepNumber + 1, frame);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.logger.warn(`[StepExecutor] Non-fatal perception asset persistence error: ${reason}`);
            }

            if (temporalWindow && options.temporalPersistWindow !== false) {
                try {
                    const timelineAsset = await this.storage.saveTemporalWindow(runId, currentState.stepNumber + 1, temporalWindow);
                    assets = { ...assets, ...timelineAsset };
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    this.logger.warn(`[StepExecutor] Non-fatal temporal window persistence error: ${reason}`);
                }
            }

            await this.trace.tracePerception(runId, currentState.stepNumber + 1, {
                timestamp: Date.now(),
                sensorData: {
                    domCount: frame.semantic.dom ? 1 : 0, // Simplified for now
                    ariaPresent: !!frame.semantic.accessibility,
                    visionPresent: frame.vision.count > 0,
                    metadata: frame.metadata
                },
                ...(temporalWindow ? {
                    temporal: {
                        ...(temporalWindow.mode ? { mode: temporalWindow.mode } : {}),
                        frameCount: temporalWindow.frames.length,
                        fromTimestamp: temporalWindow.fromTimestamp,
                        toTimestamp: temporalWindow.toTimestamp,
                        summary: temporalWindow.summary,
                        ...(temporalWindow.tokenEstimate !== undefined ? { tokenEstimate: temporalWindow.tokenEstimate } : {}),
                        ...(temporalWindow.redactionApplied !== undefined ? { redactionApplied: temporalWindow.redactionApplied } : {})
                    }
                } : {})
            });

            const viewport = await browser.getViewportSize();

            const snapshot: import('@domain/value-objects').DOMSnapshot = {
                ...frame.semantic.dom,
                screenshot: options.vision && frame.vision.primaryScreenshot ? frame.vision.primaryScreenshot.toString('base64') : undefined,
                screenshots: options.vision ? frame.vision.screenshots.map(b => b.toString('base64')) : [],
                accessibilityTree: frame.semantic.accessibility
            };

            const snapshotSignature = this.buildSnapshotSignature(snapshot, runtimeUrl);
            if (previousSnapshotSignature && snapshotSignature === previousSnapshotSignature) {
                stagnantSnapshotCount += 1;
            } else {
                stagnantSnapshotCount = 0;
            }
            previousSnapshotSignature = snapshotSignature;

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

                this.evidenceBlackboard.recordAction(runId, deterministicAction, 'not_executed');

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

            const composedAdvice = this.evidenceBlackboard.composeAdvice(
                runId,
                adviceForNextAttempt,
                MAX_ADVICE_CONTEXT_CHARS
            );

            const context: LLMContext = {
                goal: stepGoal,
                snapshot,
                previousActions: currentState.history.slice(-MAX_HISTORY_CONTEXT_ACTIONS),
                currentUrl: runtimeUrl,
                pageTitle: frame.metadata.title,
                viewport,
                stepsRemaining: maxActions - loopCount,
                availableTools: this.toolContractService.getToolDescriptors(),
                ...(composedAdvice ? { advice: composedAdvice } : {}),
                ...(temporalWindow ? { temporalWindow } : {})
            };

            await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                agentInput: {
                    goal: stepGoal,
                    currentUrl: runtimeUrl,
                        promptPreview: JSON.stringify(context).substring(0, 500) + '...',
                        ...(temporalWindow ? {
                            timelineSummary: temporalWindow.summary,
                            timelineFrameCount: temporalWindow.frames.length
                        } : {})
                }
            });

            const overrideAction = executionContext?.overrideProvider?.consumeActionOverride();
            let action: AgentAction;

            if (overrideAction) {
                action = overrideAction;
                await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                    agentOutput: {
                        thought: action.thought || '',
                        action,
                        rawResponse: 'operator-action-override'
                    }
                });
            } else {
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
                action = actionResult.value;

                await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                    agentOutput: {
                        thought: action.thought || '',
                        action: action,
                        rawResponse: JSON.stringify(action)
                    }
                });
            }

            if (action.type !== ActionType.FAIL && this.loopDetector.isLoop(currentState.history, action)) {
                return {
                    success: false,
                    terminal: 'error',
                    code: 'loop_detected',
                    reason: `Loop detected. Action '${action.type}' repeated too many times.`
                };
            }

            if (action.type === ActionType.SCROLL) {
                consecutiveScrollActions += 1;

                const noProgressScrollLoop = stagnantSnapshotCount >= 3 && consecutiveScrollActions >= 3;
                if (noProgressScrollLoop) {
                    return {
                        success: false,
                        terminal: 'error',
                        code: 'loop_detected',
                        reason: 'No observable page change after repeated scroll actions.'
                    };
                }
            } else {
                consecutiveScrollActions = 0;
            }

            yield { type: 'action', action, assets };

            if (action.type === ActionType.PASS && !supervisedTerminalPass) {
                return { success: true, terminal: 'pass' };
            }

            let executionOutcome: 'executed' | 'execution_error' | 'not_executed' = 'not_executed';
            let executionError: string | undefined;

            if (action.type === ActionType.FAIL) {
                executionOutcome = 'not_executed';
                executionError = action.reason;
            } else if (action.type === ActionType.PASS && supervisedTerminalPass) {
                executionOutcome = 'not_executed';
            } else {
                const viewportValidationError = this.validateActionAgainstViewport(action, viewport);
                if (viewportValidationError) {
                    executionOutcome = 'execution_error';
                    executionError = viewportValidationError;
                } else {
                    const execResult = await this.toolExecutor.execute(action, {
                        browser,
                        currentUrl: runtimeUrl,
                        ...(executionContext?.toolContext ? { toolContext: executionContext.toolContext } : {})
                    });

                    if (execResult.isErr()) {
                        executionOutcome = 'execution_error';
                        executionError = execResult.error.message;
                    } else {
                        executionOutcome = 'executed';
                    }
                }
            }

            this.evidenceBlackboard.recordAction(runId, action, executionOutcome);

            const evaluationResult = await this.llmProvider.generateEvaluation({
                ...context,
                attemptedAction: action,
                executionOutcome,
                ...(executionError ? { executionError } : {})
            });

            if (evaluationResult.isErr()) {
                return {
                    success: false,
                    terminal: 'error',
                    code: 'llm_error',
                    reason: `Evaluator failed: ${evaluationResult.error.message}`
                };
            }

            const evaluation = evaluationResult.value;
            let governedEvaluation: LLMEvaluationDecision;

            try {
                const policyDecision = this.verificationPolicy.enforce(evaluation, {
                    attemptedAction: action,
                    executionOutcome,
                    stepsRemaining: maxActions - loopCount,
                    priorActionCount: currentState.history.length
                }, effectiveVerificationPolicyProfile);
                governedEvaluation = policyDecision.evaluation;

                if (policyDecision.adjusted) {
                    this.logger.info(`[StepExecutor] Verification policy adjusted evaluator decision: ${policyDecision.reason}`);
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    terminal: 'error',
                    code: 'agent_fail',
                    reason: `Verification policy rejected evaluator output: ${reason}`
                };
            }

            this.evidenceBlackboard.recordEvaluation(runId, governedEvaluation);

            if (executionContext?.onEvaluation) {
                await executionContext.onEvaluation({
                    evaluation: governedEvaluation,
                    attemptedAction: action,
                    executionOutcome,
                    ...(executionError ? { executionError } : {})
                });
            }

            await this.trace.traceReasoning(runId, currentState.stepNumber + 1, {
                agentOutput: {
                    thought: `Evaluator decision: ${governedEvaluation.decision}`,
                    action: null,
                    rawResponse: JSON.stringify(governedEvaluation)
                }
            });

            if (governedEvaluation.decision === 'sub_task_success') {
                return { success: true, terminal: 'pass' };
            }

            if (governedEvaluation.decision === 'need_reformulate') {
                return {
                    success: false,
                    terminal: 'fail',
                    code: 'agent_fail',
                    reason: governedEvaluation.summary
                };
            }

            adviceForNextAttempt = governedEvaluation.advice ?? governedEvaluation.summary;
            consecutiveEvaluatorRetries += 1;

            if (consecutiveEvaluatorRetries >= 3 && loopCount >= maxActions - 1) {
                return {
                    success: false,
                    terminal: 'max_actions',
                    code: 'max_actions_reached',
                    reason: `Evaluator requested repeated retries but action budget is exhausted for step: ${stepGoal}`
                };
            }

            if (executionOutcome === 'execution_error' && !executionError) {
                return {
                    success: false,
                    terminal: 'error',
                    code: 'action_execution_error',
                    reason: 'Action execution failed with unknown error'
                };
            }

            currentState = {
                ...currentState,
                history: [...currentState.history, action],
                stepNumber: currentState.stepNumber + 1
            };
            loopCount++;
        }

        return {
            success: false,
            terminal: 'max_actions',
            code: 'max_actions_reached',
            reason: `Max actions (${maxActions}) reached for step: ${stepGoal}`
        };
    }

    private async captureTemporalWindowIfEnabled(
        runId: string,
        browser: IBrowserAutomation,
        baseFrame: import('@domain/value-objects/PerceptionFrame').PerceptionFrame,
        options: {
            vision: boolean;
            debugScreenshots: boolean;
            temporalObservation?: boolean;
            temporalMode?: TemporalObservationMode;
            temporalBurstFrames?: number;
            temporalBaselineIntervalMs?: number;
            temporalBurstIntervalMs?: number;
            temporalMaxFramesPerWindow?: number;
            temporalPromptTokenBudget?: number;
            temporalRedactSensitive?: boolean;
        },
        signal: {
            domVelocity: number;
            interactionInFlight: boolean;
            recentAssertionMismatch: boolean;
            recentExecutionError?: boolean;
            stagnantCycles?: number;
        }
    ): Promise<TimelineContextWindow | undefined> {
        const capturePlan = this.temporalPolicy.planCapture({
            featureEnabled: true,
            requested: Boolean(options.temporalObservation),
            ...(options.temporalMode ? { mode: options.temporalMode } : {}),
            signal,
            overrides: {
                ...(options.temporalBaselineIntervalMs ? { baselineIntervalMs: options.temporalBaselineIntervalMs } : {}),
                ...(options.temporalBurstIntervalMs ? { burstIntervalMs: options.temporalBurstIntervalMs } : {}),
                ...(options.temporalBurstFrames ? { burstMaxFrames: options.temporalBurstFrames } : {}),
                ...(options.temporalMaxFramesPerWindow ? { maxFramesPerWindow: options.temporalMaxFramesPerWindow } : {})
            }
        });

        if (!capturePlan.enabled) {
            return undefined;
        }

        const timelineFrames: SnapshotFrame[] = [this.toSnapshotFrame(baseFrame, options.temporalBaselineIntervalMs ?? 1000)];
        let previousTimestamp = baseFrame.timestamp;
        let previousDomHash = timelineFrames[0]?.domHash;
        let stableFrameStreak = 0;

        for (let index = 1; index < capturePlan.maxFrames; index++) {
            await new Promise(resolve => setTimeout(resolve, capturePlan.burstIntervalMs));

            const frameResult = await this.perception.capture(browser, {
                vision: options.vision || options.debugScreenshots,
                aria: true,
                dom: true
            });

            if (frameResult.isErr()) {
                this.logger.debug(`[StepExecutor] Temporal capture stopped at frame ${index}: ${frameResult.error.message}`);
                break;
            }

            const frame = frameResult.value;
            const interval = Math.max(1, frame.timestamp - previousTimestamp);
            previousTimestamp = frame.timestamp;

            const snapshotFrame = this.toSnapshotFrame(frame, interval);
            timelineFrames.push(snapshotFrame);

            if (snapshotFrame.domHash === previousDomHash) {
                stableFrameStreak += 1;
                if (stableFrameStreak >= TEMPORAL_STABLE_FRAME_STREAK) {
                    this.logger.debug(`[StepExecutor] Temporal capture early-stop after ${index + 1} frames due to stable DOM signature`);
                    break;
                }
            } else {
                stableFrameStreak = 0;
            }

            previousDomHash = snapshotFrame.domHash;
        }

        const assembled = this.timelineAssembler.assemble(runId, timelineFrames, capturePlan.maxFramesPerWindow);
        const selected = this.temporalSelector.select(assembled.frames, { maxFrames: capturePlan.maxFramesPerWindow });
        const redacted = this.temporalPrivacyFilter.redact(selected.frames, { enabled: options.temporalRedactSensitive ?? true });

        return this.temporalPromptAssembler.assemble({
            runId,
            mode: capturePlan.mode,
            frames: redacted.frames,
            maxFramesPerWindow: capturePlan.maxFramesPerWindow,
            droppedFrameCount: selected.droppedFrameCount,
            redactionApplied: redacted.redactionApplied,
            ...(options.temporalPromptTokenBudget !== undefined ? { tokenBudget: options.temporalPromptTokenBudget } : {})
        });
    }

    private toSnapshotFrame(
        frame: import('@domain/value-objects/PerceptionFrame').PerceptionFrame,
        intervalMs: number
    ): SnapshotFrame {
        const domHash = `${frame.metadata.url}|${frame.metadata.title}|${frame.semantic.dom?.elements?.length ?? 0}`;

        return {
            timestamp: frame.timestamp,
            intervalMs,
            domHash,
            note: 'perception-capture'
        };
    }

    private buildSnapshotSignature(snapshot: import('@domain/value-objects').DOMSnapshot, currentUrl: string): string {
        const topElements = snapshot.elements
            .slice(0, 25)
            .map((element) => `${element.tag}:${(element.role ?? '').toLowerCase()}:${this.normalizeForSignature(element.text).slice(0, 48)}`)
            .join('|');

        return [
            this.normalizeForSignature(currentUrl),
            this.normalizeForSignature(snapshot.title),
            String(snapshot.elements.length),
            topElements
        ].join('::');
    }

    private normalizeForSignature(input: string): string {
        return input.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    private isInteractionLikelyInFlight(history: readonly AgentAction[]): boolean {
        const lastAction = history[history.length - 1];
        if (!lastAction) {
            return false;
        }

        return lastAction.type === ActionType.CLICK
            || lastAction.type === ActionType.TYPE
            || lastAction.type === ActionType.PRESS_KEY
            || lastAction.type === ActionType.MOUSE_CLICK_LEFT
            || lastAction.type === ActionType.MOUSE_DOUBLE_CLICK
            || lastAction.type === ActionType.MOUSE_DRAG;
    }

    private validateActionAgainstViewport(
        action: AgentAction,
        viewport: { width: number; height: number }
    ): string | undefined {
        const isInBounds = (x: number, y: number): boolean => (
            Number.isFinite(x)
            && Number.isFinite(y)
            && x >= 0
            && y >= 0
            && x < viewport.width
            && y < viewport.height
        );

        switch (action.type) {
            case ActionType.MOUSE_MOVE:
            case ActionType.MOUSE_CLICK_LEFT:
            case ActionType.MOUSE_CLICK_RIGHT:
            case ActionType.MOUSE_DOUBLE_CLICK:
                if (!isInBounds(action.x, action.y)) {
                    return `Viewport safety check failed for '${action.type}': coordinates (${action.x}, ${action.y}) are outside viewport ${viewport.width}x${viewport.height}`;
                }
                return undefined;
            case ActionType.MOUSE_DRAG:
                if (!isInBounds(action.fromX, action.fromY) || !isInBounds(action.toX, action.toY)) {
                    return `Viewport safety check failed for '${action.type}': drag coordinates (${action.fromX}, ${action.fromY}) -> (${action.toX}, ${action.toY}) are outside viewport ${viewport.width}x${viewport.height}`;
                }
                return undefined;
            default:
                return undefined;
        }
    }
}
