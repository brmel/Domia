import { injectable, inject } from 'tsyringe';
import { LlmAgent, Gemini, Runner, InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Content, Part } from '@google/genai';
import { FunctionCallingConfigMode } from '@google/genai';
import type { IStructuredAutomation, IPerceptionPipeline, ILogger, IStorageService } from '@domain/ports';
import type { IAgentRuntime, AgentEvent, AgentOutcome, AgentInput } from '@domain/ports/IAgentRuntime';
import type { IPromptService } from '@domain/ports/IPromptService';
import { ActionType } from '@domain/enums';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { createAdkTools } from './AdkToolFactory';
import { ActionMapper } from '@infrastructure/agent/common/ActionMapper';
import { buildAgentInstruction } from '@infrastructure/agent/common/AgentInstructionBuilder';
import { interpolate } from '@infrastructure/prompts/interpolate';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { ShellCommandPolicyService } from '@infrastructure/shell/ShellCommandPolicyService';
import type { IConfigService } from '@domain/ports/IConfigService';
import type { ElectronWindowManager } from '@infrastructure/drivers/ElectronWindowManager';
import type { ITabManager } from '@domain/ports/ITabManager';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { DEFAULT_LLM_MODEL, LLM_CALL_BUDGET_OFFSET, FINAL_RESPONSE_LOG_CHARS, TOOL_TIME_LOG_THRESHOLD_MS } from '@shared/defaults';

const APP_NAME = 'domia';
const LOG_TAG = '[AdkAgentRuntime]';

function extractThought(event: { content?: { parts?: Array<{ text?: string }> } }): string {
    if (!event.content?.parts) return '';
    return event.content.parts
        .filter((p): p is { text: string } => typeof p.text === 'string' && p.text.trim().length > 0)
        .map(p => p.text.trim())
        .join('\n');
}

interface StepExecutionState {
    actionCount: number;
    lastToolResult: { name: string; result: Record<string, unknown>; durationMs: number } | null;
    pendingYield: AgentEvent | null;
    lastObservedUrl: string;
    llmTurnStartMs: number;
}

@injectable()
export class AdkAgentRuntime implements IAgentRuntime {
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

    async *run(
        input: AgentInput,
        automation: IStructuredAutomation,
    ): AsyncGenerator<AgentEvent, AgentOutcome, unknown> {
        const { stepGoal, url, maxActions, vision } = input;

        const llmConfig = this.llmConfigResolver.resolve();
        if (!llmConfig.apiKey) {
            return { kind: 'error', cause: new Error('No API key configured. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.') };
        }
        const model = llmConfig.model || DEFAULT_LLM_MODEL;

        const perceptionSource = automation.getPerceptionSource();
        if (!perceptionSource) {
            return { kind: 'error', cause: new Error('Automation adapter does not expose a perception source.') };
        }

        const viewport = await automation.getViewportSize();

        const state: StepExecutionState = {
            actionCount: 0,
            lastToolResult: null,
            pendingYield: null,
            lastObservedUrl: url,
            llmTurnStartMs: Date.now(),
        };
        const toolTimers = new Map<string, number>();

        const windowManager = input.extras?.['windowManager'] as ElectronWindowManager | undefined;

        const toolDeps = this.buildToolDeps(input, automation, perceptionSource, vision, windowManager, () => state.actionCount);
        const { tools, catalog, captureMiddleware } = createAdkTools(toolDeps, this.pluginRegistry.getAllTools(), this.promptService);

        const actionMapper = new ActionMapper(catalog);
        const instruction = buildAgentInstruction(catalog, this.promptService);

        const stepGoalText = interpolate(this.promptService.getPrompt('stepGoal'), {
            stepGoal, viewportWidth: viewport.width, viewportHeight: viewport.height, url, maxActions,
        });

        const initialMessage: Content = { role: 'user', parts: [{ text: stepGoalText }] };

        const agent = new LlmAgent({
            name: 'app_agent',
            model: new Gemini({ model, apiKey: llmConfig.apiKey }),
            instruction,
            tools,
            generateContentConfig: {
                temperature: 0,
                toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            },
            beforeToolCallback: ({ tool }) => {
                toolTimers.set(tool.name, Date.now());
                return undefined;
            },
            afterToolCallback: ({ tool, response }) => {
                const durationMs = Date.now() - (toolTimers.get(tool.name) ?? Date.now());
                toolTimers.delete(tool.name);
                const res = response as Record<string, unknown>;
                state.lastToolResult = { name: tool.name, result: res, durationMs };
                state.lastObservedUrl = (res?.['currentUrl'] ?? res?.['navigatedUrl'] ?? state.lastObservedUrl) as string;
                this.logger.debug(`${LOG_TAG} Tool ${tool.name} completed in ${durationMs}ms`, { status: res?.['status'] });
                return undefined;
            },
        });

        const sessionService = new InMemorySessionService();
        const runner = new Runner({ appName: APP_NAME, agent, sessionService });
        const session = await sessionService.createSession({
            appName: APP_NAME, userId: 'domia', sessionId: input.runId,
        });

        try {
            state.llmTurnStartMs = Date.now();

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
                    const llmLatencyMs = this.computeLlmLatency(state);

                    for (const fc of functionCalls) {
                        yield* this.flushPending(state);

                        const action = actionMapper.map(fc.name!, fc.args as Record<string, unknown>, thought);
                        state.actionCount++;
                        this.logger.info(`${LOG_TAG} Action ${state.actionCount}/${maxActions}: ${fc.name}`, fc.args);

                        const actionEvent = this.buildActionEvent(action, state, stepGoal, maxActions, llmLatencyMs, thought, event, fc);

                        if (action.type === ActionType.FINISH) {
                            yield actionEvent;
                            const finishAction = action as { summary: string; verdict?: 'pass' | 'fail'; value?: unknown };
                            return {
                                kind: 'done',
                                output: {
                                    summary: finishAction.summary,
                                    ...(finishAction.verdict !== undefined ? { verdict: finishAction.verdict } : {}),
                                    ...(finishAction.value !== undefined ? { value: finishAction.value } : {}),
                                },
                            };
                        }

                        if (state.actionCount >= maxActions) {
                            yield actionEvent;
                            return {
                                kind: 'stopped',
                                reason: 'budget_exhausted',
                                summary: `Max actions (${maxActions}) reached for step: ${stepGoal}`,
                            };
                        }

                        state.pendingYield = actionEvent;
                    }

                    state.llmTurnStartMs = Date.now();
                    continue;
                }

                this.injectVisionMedia(vision, event, captureMiddleware);

                if (isFinalResponse(event)) {
                    yield* this.flushPending(state);
                    const text = stringifyContent(event);
                    this.logger.info(`${LOG_TAG} Final response: ${text.slice(0, FINAL_RESPONSE_LOG_CHARS)}`);
                    return {
                        kind: 'done',
                        output: { summary: text || `Completed ${state.actionCount} action(s).` },
                    };
                }
            }

            yield* this.flushPending(state);
        } catch (error) {
            const cause = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`${LOG_TAG} Agent error: ${cause.message}`);
            return { kind: 'error', cause };
        }

        return {
            kind: 'stopped',
            reason: 'budget_exhausted',
            summary: `LLM call budget exhausted after ${state.actionCount} action(s).`,
        };
    }

    private *flushPending(state: StepExecutionState): Generator<AgentEvent> {
        if (!state.pendingYield) return;

        if (state.pendingYield.type === 'action' && state.lastToolResult) {
            yield {
                ...state.pendingYield,
                trace: {
                    ...state.pendingYield.trace,
                    toolCall: {
                        ...state.pendingYield.trace.toolCall!,
                        result: state.lastToolResult.result,
                        durationMs: state.lastToolResult.durationMs,
                    },
                },
            };
            state.lastToolResult = null;
        } else {
            yield state.pendingYield;
        }
        state.pendingYield = null;
    }

    private computeLlmLatency(state: StepExecutionState): number {
        const roundTripMs = Date.now() - state.llmTurnStartMs;
        const prevToolMs = state.lastToolResult?.durationMs ?? 0;
        const llmLatencyMs = Math.max(0, roundTripMs - prevToolMs);

        if (prevToolMs > TOOL_TIME_LOG_THRESHOLD_MS) {
            this.logger.info(`${LOG_TAG} LLM responded in ${llmLatencyMs}ms (tool: ${prevToolMs}ms, round-trip: ${roundTripMs}ms)`);
        } else {
            this.logger.info(`${LOG_TAG} LLM responded in ${llmLatencyMs}ms`);
        }
        return llmLatencyMs;
    }

    private buildActionEvent(
        action: ReturnType<ActionMapper['map']>,
        state: StepExecutionState,
        stepGoal: string,
        maxActions: number,
        llmLatencyMs: number,
        thought: string,
        event: { content?: { parts?: Part[] } },
        fc: { name?: string; args?: unknown },
    ): AgentEvent {
        const { thought: _t, ...actionWithoutThought } = action as unknown as Record<string, unknown>;
        return {
            type: 'action',
            action,
            actionIndex: state.actionCount,
            trace: {
                timestamp: Date.now(),
                agentInput: {
                    goal: stepGoal,
                    currentUrl: state.lastObservedUrl,
                    promptPreview: `GOAL: ${stepGoal} | URL: ${state.lastObservedUrl} | Action ${state.actionCount}/${maxActions}`,
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
    }

    private injectVisionMedia(
        vision: boolean,
        event: { content?: { parts?: Part[] } },
        captureMiddleware: PostActionCaptureMiddleware,
    ): void {
        if (!vision || !event.content?.parts?.some((p: Part) => 'functionResponse' in p)) return;

        const media = captureMiddleware.consumeMedia();
        for (const m of media) {
            (event.content!.parts as unknown[]).push({
                inlineData: { data: m.data.toString('base64'), mimeType: m.mimeType },
            });
        }
        if (media.length > 0) {
            this.logger.info(`${LOG_TAG} Injected ${media.length} screenshot(s) as inlineData into function response event`);
        }
    }

    private buildToolDeps(
        input: AgentInput,
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
            platform: input.platform,
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
                    await this.storage.savePerceptionAssets(input.runId, getActionCount(), capturedFrame);
                } catch {
                    this.logger.warn(`${LOG_TAG} Failed to save perception assets for action ${getActionCount()}`);
                }
            },
            ...(input.recording?.enabled && {
                recording: {
                    enabled: true as const,
                    options: {
                        ...(input.recording.maxDurationMs !== undefined && { maxDurationMs: input.recording.maxDurationMs }),
                        ...(input.recording.intervalMs !== undefined && { intervalMs: input.recording.intervalMs }),
                    },
                },
            }),
            onRecording: async (recording) => {
                try {
                    await this.storage.saveActionRecording(input.runId, getActionCount(), recording);
                } catch {
                    this.logger.warn(`${LOG_TAG} Failed to save action recording for action ${getActionCount()}`);
                }
            },
        };
    }
}
