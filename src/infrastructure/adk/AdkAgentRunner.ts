import { injectable, inject } from 'tsyringe';
import { LlmAgent, Gemini, Runner, InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Content, Part } from '@google/genai';
import { FunctionCallingConfigMode } from '@google/genai';
import type { IStructuredAutomation, IPerceptionPipeline, ILogger, IStorageService } from '@domain/ports';
import type { IAgentRunner, AgentRunnerEvent, StepExecutionResult, StepRunnerConfig } from '@domain/ports/IAgentRunner';
import type { IPromptService } from '@domain/ports/IPromptService';
import { ActionType } from '@domain/enums/ActionType';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { createAdkTools } from './AdkToolFactory';
import { ActionMapper } from '@infrastructure/agent/common/ActionMapper';
import { AgentLoopGuard } from '@infrastructure/agent/common/AgentLoopGuard';
import { buildAgentInstruction } from '@infrastructure/agent/common/AgentInstructionBuilder';
import { interpolate } from '@infrastructure/prompts/interpolate';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { ShellCommandPolicyService } from '@infrastructure/shell/ShellCommandPolicyService';
import type { IConfigService } from '@domain/ports/IConfigService';
import type { ElectronWindowManager } from '@infrastructure/drivers/ElectronWindowManager';
import type { ITabManager } from '@domain/ports/ITabManager';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import { DEFAULT_LLM_MODEL, LLM_CALL_BUDGET_OFFSET, DEFAULT_LOOP_GUARD_THRESHOLD, FINAL_RESPONSE_LOG_CHARS, TOOL_TIME_LOG_THRESHOLD_MS } from '@shared/defaults';

const APP_NAME = 'domia';

function extractThought(event: { content?: { parts?: Array<{ text?: string }> } }): string {
    if (!event.content?.parts) return '';
    return event.content.parts
        .filter((p): p is { text: string } => typeof p.text === 'string' && p.text.trim().length > 0)
        .map(p => p.text.trim())
        .join('\n');
}

@injectable()
export class AdkAgentRunner implements IAgentRunner {
    constructor(
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfigResolver: LlmRuntimeConfigResolver,
        @inject(PluginRegistry) private readonly pluginRegistry: PluginRegistry,
        @inject('IPromptService') private readonly promptService: IPromptService,
        @inject(ShellExecutor) private readonly shellExecutor: ShellExecutor,
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {}

    async *executeStep(
        config: StepRunnerConfig,
        automation: IStructuredAutomation,
    ): AsyncGenerator<AgentRunnerEvent, StepExecutionResult, unknown> {
        const { stepGoal, url, maxActions, vision } = config;

        const llmConfig = this.llmConfigResolver.resolve();
        if (!llmConfig.apiKey) {
            return {
                success: false, terminal: 'error', code: 'llm_error',
                reason: 'No API key configured. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.',
            };
        }
        const model = llmConfig.model || DEFAULT_LLM_MODEL;

        const perceptionSource = automation.getPerceptionSource();
        if (!perceptionSource) {
            return {
                success: false, terminal: 'error', code: 'perception_error',
                reason: 'Automation adapter does not expose a perception source.',
            };
        }

        const viewport = await automation.getViewportSize();

        let actionCount = 0;
        const toolTimers = new Map<string, number>();
        let lastToolResult: { name: string; result: Record<string, unknown>; durationMs: number } | null = null;
        let pendingYield: AgentRunnerEvent | null = null;
        let lastObservedUrl: string = url;
        let llmTurnStartMs = Date.now();

        // Live-view screenshot streaming
        let latestScreenshot: string | null = null;
        let screenshotPromise: Promise<void> | null = null;

        const captureScreenshotForView = (): void => {
            screenshotPromise = perceptionSource.captureScreenshot()
                .then(buf => { latestScreenshot = buf.toString('base64'); })
                .catch(e => this.logger.debug('[AdkAgentRunner] Screenshot capture failed: %s', e));
        };

        const flushPending = function* (): Generator<AgentRunnerEvent> {
            if (!pendingYield) return;
            if (pendingYield.type !== 'action') {
                yield pendingYield;
                pendingYield = null;
                return;
            }
            if (lastToolResult) {
                yield {
                    ...pendingYield,
                    trace: {
                        ...pendingYield.trace,
                        toolCall: {
                            ...pendingYield.trace.toolCall!,
                            result: lastToolResult.result,
                            durationMs: lastToolResult.durationMs,
                        },
                    },
                };
                lastToolResult = null;
            } else {
                yield pendingYield;
            }
            pendingYield = null;
        };

        const windowManager = config.extras?.['windowManager'] as ElectronWindowManager | undefined;

        const toolDeps = this.buildToolDeps(config, automation, perceptionSource, vision, windowManager, () => actionCount);
        const { tools, catalog } = createAdkTools(toolDeps, this.pluginRegistry.getAllTools(), this.promptService);

        const actionMapper = new ActionMapper(catalog);
        const loopGuard = new AgentLoopGuard(DEFAULT_LOOP_GUARD_THRESHOLD, this.promptService);
        const instruction = buildAgentInstruction(catalog, this.promptService);

        const stepGoalTemplate = this.promptService.getPrompt('stepGoal');
        const stepGoalText = interpolate(stepGoalTemplate, {
            stepGoal,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            url,
            maxActions,
        });

        const textPart: Part = { text: stepGoalText };

        const initialMessage: Content = { role: 'user', parts: [textPart] };

        const agent = new LlmAgent({
            name: 'app_agent',
            model: new Gemini({ model, apiKey: llmConfig.apiKey }),
            instruction,
            tools,
            generateContentConfig: {
                temperature: 0,
                    toolConfig: {
                        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
                    },
            },
            beforeToolCallback: ({ tool, args }) => {
                const sig = `${tool.name}:${JSON.stringify(args)}`;
                loopGuard.record(tool.name, args as Record<string, unknown>);
                if (loopGuard.isLoop()) {
                    const warning = loopGuard.recordViolation(tool.name);
                    this.logger.warn(`[AdkAgentRunner] Loop detected: ${sig}`);
                    return { status: 'error', error: warning };
                }
                toolTimers.set(tool.name, Date.now());
                return undefined;
            },
            afterToolCallback: ({ tool, response }) => {
                const start = toolTimers.get(tool.name);
                const durationMs = start ? Date.now() - start : 0;
                toolTimers.delete(tool.name);
                lastToolResult = { name: tool.name, result: response as Record<string, unknown>, durationMs };
                const res = response as Record<string, unknown>;
                if (typeof res?.['currentUrl'] === 'string') {
                    lastObservedUrl = res['currentUrl'] as string;
                } else if (typeof res?.['navigatedUrl'] === 'string') {
                    lastObservedUrl = res['navigatedUrl'] as string;
                }
                this.logger.debug(`[AdkAgentRunner] Tool ${tool.name} completed in ${durationMs}ms`, { status: res?.['status'] });
                captureScreenshotForView();
                return undefined;
            },
        });

        const sessionService = new InMemorySessionService();
        const runner = new Runner({ appName: APP_NAME, agent, sessionService });
        const session = await sessionService.createSession({
            appName: APP_NAME, userId: 'domia', sessionId: config.runId,
        });

        try {
            llmTurnStartMs = Date.now();

            for await (const event of runner.runAsync({
                userId: session.userId,
                sessionId: session.id,
                newMessage: initialMessage,
                runConfig: { maxLlmCalls: maxActions + LLM_CALL_BUDGET_OFFSET },
            })) {
                const functionCalls = getFunctionCalls(event);
                const thought = extractThought(event);

                if (thought && !functionCalls?.length && !isFinalResponse(event)) {
                    yield { type: 'thinking_chunk', text: thought };
                }

                if (functionCalls?.length) {
                    // Terminate if the loop guard signalled irrecoverable looping
                    if (loopGuard.shouldTerminate()) {
                        yield* flushPending();
                        this.logger.warn(`[AdkAgentRunner] Step terminated: agent ignored loop warnings. Last call: ${loopGuard.getLastLoopingArg()}`);
                        return {
                            success: false, terminal: 'fail', code: 'agent_fail',
                            reason: `Agent stuck in a loop (${loopGuard.getLastLoopingArg()}) and ignored repeated warnings.`,
                        };
                    }

                    const roundTripMs = Date.now() - llmTurnStartMs;
                    const prevToolMs = (lastToolResult as { durationMs: number } | null)?.durationMs ?? 0;
                    const llmLatencyMs = Math.max(0, roundTripMs - prevToolMs);
                    if (prevToolMs > TOOL_TIME_LOG_THRESHOLD_MS) {
                        this.logger.info(`[AdkAgentRunner] LLM responded in ${llmLatencyMs}ms (tool: ${prevToolMs}ms, round-trip: ${roundTripMs}ms)`);
                    } else {
                        this.logger.info(`[AdkAgentRunner] LLM responded in ${llmLatencyMs}ms`);
                    }

                    if (screenshotPromise) {
                        await screenshotPromise;
                        screenshotPromise = null;
                }
                    if (latestScreenshot) {
                        yield { type: 'screenshot', data: latestScreenshot };
                        latestScreenshot = null;
                    }

                    for (const fc of functionCalls) {
                        yield* flushPending();

                        const action = actionMapper.map(fc.name!, fc.args as Record<string, unknown>, thought);
                        actionCount++;

                        this.logger.info(`[AdkAgentRunner] Action ${actionCount}/${maxActions}: ${fc.name}`, fc.args);

                        const { thought: _t, ...actionWithoutThought } = action as unknown as Record<string, unknown>;

                        const actionEvent: AgentRunnerEvent = {
                            type: 'action',
                            action,
                            actionIndex: actionCount,
                            trace: {
                                timestamp: Date.now(),
                                agentInput: {
                                    goal: stepGoal,
                                    currentUrl: lastObservedUrl,
                                    promptPreview: `GOAL: ${stepGoal} | URL: ${lastObservedUrl} | Action ${actionCount}/${maxActions}`,
                                    llmLatencyMs,
                                },
                                agentOutput: {
                                    thought,
                                    action: actionWithoutThought as Record<string, unknown>,
                                    rawResponse: JSON.stringify(event.content ?? {}, null, 2),
                                },
                                toolCall: {
                                    name: fc.name!,
                                    input: fc.args as Record<string, unknown>,
                                },
                            },
                        };

                        if (action.type === ActionType.PASS) {
                            yield actionEvent;
                            return { success: true, terminal: 'pass' };
                        }
                        if (action.type === ActionType.FAIL) {
                            yield actionEvent;
                            return {
                                success: false, terminal: 'fail', code: 'agent_fail',
                                reason: (action as { reason: string }).reason,
                            };
                        }
                        if (actionCount >= maxActions) {
                            yield actionEvent;
                            return {
                                success: false, terminal: 'max_actions', code: 'max_actions_reached',
                                reason: `Max actions (${maxActions}) reached for step: ${stepGoal}`,
                            };
                        }

                        pendingYield = actionEvent;
                    }

                    llmTurnStartMs = Date.now();

                    continue;
                }

                if (isFinalResponse(event)) {
                    yield* flushPending();

                    const text = stringifyContent(event);
                    this.logger.info(`[AdkAgentRunner] Final response: ${text.slice(0, FINAL_RESPONSE_LOG_CHARS)}`);
                    if (actionCount === 0) {
                        return {
                            success: false, terminal: 'fail', code: 'agent_fail',
                            reason: 'Agent generated text without calling any tools',
                        };
                    }
                    break;
                }
            }

            yield* flushPending();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[AdkAgentRunner] Agent error: ${message}`);
            return {
                success: false, terminal: 'error', code: 'llm_error',
                reason: `ADK agent error: ${message}`,
            };
        }

        return {
            success: false, terminal: 'max_actions', code: 'max_actions_reached',
            reason: `Agent finished without calling pass/fail. Completed ${actionCount} actions.`,
        };
    }

    private buildToolDeps(
        config: StepRunnerConfig,
        automation: IStructuredAutomation,
        perceptionSource: ToolDependencies['perceptionSource'],
        vision: boolean,
        windowManager: ElectronWindowManager | undefined,
        getActionCount: () => number,
    ): ToolDependencies {
        return {
            automation,
            perception: this.perception,
            perceptionSource,
            vision,
            platform: config.platform,
            ...(this.configService.get().plugins.shell.enabled && {
                shellExecutor: this.shellExecutor,
                shellPolicy: new ShellCommandPolicyService(
                    this.configService.get().plugins.shell.denyPatterns,
                    this.configService.get().plugins.shell.allowedCwd,
                ),
            }),
            ...(windowManager && { windowManager }),
            ...('newTab' in automation && { tabManager: automation as unknown as ITabManager }),
            onCapture: async (capturedFrame) => {
                try {
                    await this.storage.savePerceptionAssets(config.runId, getActionCount(), capturedFrame);
                } catch {
                    this.logger.warn(`[AdkAgentRunner] Failed to save perception assets for action ${getActionCount()}`);
                }
            },
            ...(config.recording?.enabled && {
                recording: {
                    enabled: true as const,
                    options: {
                        ...(config.recording.maxDurationMs !== undefined && { maxDurationMs: config.recording.maxDurationMs }),
                        ...(config.recording.intervalMs !== undefined && { intervalMs: config.recording.intervalMs }),
                    },
                },
            }),
            onRecording: async (recording) => {
                try {
                    await this.storage.saveActionRecording(config.runId, getActionCount(), recording);
                } catch {
                    this.logger.warn(`[AdkAgentRunner] Failed to save action recording for action ${getActionCount()}`);
                }
            },
        };
    }
}
