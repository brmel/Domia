import { injectable, inject } from 'tsyringe';
import { LlmAgent, Runner, InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Event } from '@google/adk';
import { LlmConversationCompactor } from './LlmConversationCompactor';
import { buildCompactionCallback } from './buildCompactionCallback';
import { buildInstructionProvider } from './buildInstructionProvider';
import { RunMetricsPlugin, type RunMetricsState } from './RunMetricsPlugin';
import type { IAdkLlmFactory } from './IAdkLlmFactory';
import { RunArtifactSink } from './RunArtifactSink';
import { DEFAULT_ARTIFACT_RETENTION } from '@domain/value-objects/ArtifactRetention';
import type { IRunHealthMonitor } from '@domain/ports/IRunHealthMonitor';
import type { IObservationCoordinator } from '@domain/ports/IObservationCoordinator';
import { SkillRunnerService } from '@infrastructure/skills/SkillRunnerService';
import type { RunId } from '@domain/value-objects';
import type { Content, Part } from '@google/genai';
import { FunctionCallingConfigMode } from '@google/genai';
import type { IStructuredAutomation, IPerceptionPipeline, ILogger, IStorageService } from '@domain/ports';
import type { IAgentRuntime, AgentEvent, AgentOutcome, AgentInput } from '@domain/ports/IAgentRuntime';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';
import type { IPromptService } from '@domain/ports/IPromptService';
import { ActionType } from '@domain/enums';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { createAdkTools } from './AdkToolFactory';
import { ActionMapper } from '@infrastructure/agent/common/ActionMapper';
import { buildAgentInstruction } from '@infrastructure/agent/common/AgentInstructionBuilder';
import { PromptKey } from '@domain/ports/IPromptService';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { ShellCommandPolicyService } from '@infrastructure/shell/ShellCommandPolicyService';
import type { IConfigService } from '@domain/ports/IConfigService';
import type { IWindowManager } from '@domain/ports/IWindowManager';
import type { ITabManager } from '@domain/ports/ITabManager';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { DEFAULT_LLM_MODEL, LLM_CALL_BUDGET_OFFSET, FINAL_RESPONSE_LOG_CHARS, TOOL_TIME_LOG_THRESHOLD_MS, APP_NAME } from '@shared/defaults';

const LOG_TAG = '[AdkAgentRuntime]';

function extractThought(event: { content?: { parts?: Array<{ text?: string }> } }): string {
    if (!event.content?.parts) return '';
    return event.content.parts
        .filter((p): p is { text: string } => typeof p.text === 'string' && p.text.trim().length > 0)
        .map(p => p.text.trim())
        .join('\n');
}

interface StepExecutionState extends RunMetricsState {
    actionCount: number;
    pendingYield: AgentEvent | null;
    llmTurnStartMs: number;
}

const ADK_SNAPSHOT_PROVIDER = 'adk-gemini';
const ADK_SESSION_USER_ID = 'domia';

@injectable()
export class AdkAgentRuntime implements IAgentRuntime {
    private readonly sessionService = new InMemorySessionService();

    constructor(
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfigResolver: LlmRuntimeConfigResolver,
        @inject(PluginRegistry) private readonly pluginRegistry: PluginRegistry,
        @inject('IPromptService') private readonly promptService: IPromptService,
        @inject(ShellExecutor) private readonly shellExecutor: ShellExecutor,
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('IAdkLlmFactory') private readonly llmFactory: IAdkLlmFactory,
        @inject('IRunHealthMonitor') private readonly healthMonitor: IRunHealthMonitor,
        @inject(SkillRunnerService) private readonly skillRunner: SkillRunnerService,
    ) {}

    async snapshotConversation(runId: string): Promise<ConversationSnapshot | null> {
        const session = await this.sessionService.getSession({ appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: runId });
        if (!session) return null;
        return {
            providerKind: ADK_SNAPSHOT_PROVIDER,
            capturedAt: Date.now(),
            events: session.events,
        };
    }

    async restoreConversation(runId: string, snapshot: ConversationSnapshot): Promise<void> {
        if (snapshot.providerKind !== ADK_SNAPSHOT_PROVIDER) {
            throw new Error(`${LOG_TAG} Cannot restore snapshot from provider '${snapshot.providerKind}'; expected '${ADK_SNAPSHOT_PROVIDER}'`);
        }
        const events = snapshot.events as Event[];
        if (!Array.isArray(events)) {
            throw new Error(`${LOG_TAG} Snapshot events payload is not an array`);
        }
        await this.sessionService.deleteSession({ appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: runId });
        const session = await this.sessionService.createSession({ appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: runId });
        for (const event of events) {
            await this.sessionService.appendEvent({ session, event });
        }
        this.logger.info(`${LOG_TAG} Restored runId=${runId} from snapshot (${events.length} events)`);
    }

    async *run(
        input: AgentInput,
        automation: IStructuredAutomation,
    ): AsyncGenerator<AgentEvent, AgentOutcome, unknown> {
        const setup = await this.prepareRunContext(input, automation);
        if (setup.kind === 'error') return setup;
        const { state, captureMiddleware, actionMapper, runner, session, initialMessage, sink } = setup;
        const { stepGoal, maxActions, vision } = input;

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
            await sink.flushOnFailure();
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

    private async prepareRunContext(
        input: AgentInput,
        automation: IStructuredAutomation,
    ): Promise<
        | { kind: 'error'; cause: Error }
        | {
            kind: 'ok';
            state: StepExecutionState;
            captureMiddleware: PostActionCaptureMiddleware;
            actionMapper: ActionMapper;
            runner: Runner;
            session: { userId: string; id: string };
            initialMessage: Content;
            sink: RunArtifactSink;
        }
    > {
        const { stepGoal, url, maxActions, vision } = input;

        const llmConfig = this.llmConfigResolver.resolve();
        const model = llmConfig.model || DEFAULT_LLM_MODEL;
        let llm;
        try {
            llm = this.llmFactory.create({ model, apiKey: llmConfig.apiKey });
        } catch (err) {
            return { kind: 'error', cause: err instanceof Error ? err : new Error(String(err)) };
        }

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
        const windowManager = input.extras?.windowManager;
        const observation = input.extras?.observation;
        const onSuspendRequest = input.extras?.onSuspendRequest;
        const sink = new RunArtifactSink(
            input.runId,
            input.persistArtifacts ?? DEFAULT_ARTIFACT_RETENTION,
            this.storage,
            this.logger,
        );
        const toolDeps = this.buildToolDeps(input, automation, perceptionSource, vision, windowManager, () => state.actionCount, sink, observation, onSuspendRequest);
        const skillTools = await this.skillRunner.buildToolsForSession(toolDeps);
        const extraTools = [...this.pluginRegistry.getAllTools(), ...skillTools];
        const { tools, catalog, captureMiddleware } = createAdkTools(toolDeps, extraTools, this.promptService);
        const actionMapper = new ActionMapper(catalog);
        const instruction = buildAgentInstruction(catalog, this.promptService);
        const stepGoalText = this.promptService.renderPrompt(PromptKey.StepGoal, {
            stepGoal, viewportWidth: viewport.width, viewportHeight: viewport.height, url, maxActions,
        });
        const initialMessage: Content = { role: 'user', parts: [{ text: stepGoalText }] };

        const compactor = new LlmConversationCompactor(llm, this.promptService);
        const metricsPlugin = new RunMetricsPlugin(input.runId as RunId, state, this.logger, this.healthMonitor);
        const plugins: import('@google/adk').BasePlugin[] = [metricsPlugin];
        const agent = new LlmAgent({
            name: 'app_agent',
            description: 'Domia application-driving agent: perceives a target app, calls tools, and reports a verdict.',
            model: llm,
            instruction: buildInstructionProvider(instruction),
            tools,
            generateContentConfig: {
                temperature: 0,
                toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            },
            beforeModelCallback: buildCompactionCallback(compactor, this.logger),
        });

        const runner = new Runner({ agent, appName: APP_NAME, plugins, sessionService: this.sessionService });
        const existing = await this.sessionService.getSession({
            appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: input.runId,
        });
        const session = existing ?? await this.sessionService.createSession({
            appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: input.runId,
        });

        return { kind: 'ok', state, captureMiddleware, actionMapper, runner, session, initialMessage, sink };
    }

    private buildToolDeps(
        input: AgentInput,
        automation: IStructuredAutomation,
        perceptionSource: ToolDependencies['perceptionSource'],
        vision: boolean,
        windowManager: IWindowManager | undefined,
        getActionCount: () => number,
        sink: RunArtifactSink,
        observation: IObservationCoordinator | undefined,
        onSuspendRequest: ((reason: string) => void) | undefined,
    ): ToolDependencies {
        return {
            automation,
            perception: this.perception,
            perceptionSource,
            vision,
            platform: input.platform,
            runId: input.runId,
            ...(this.configService.get().plugins.shell.enabled && {
                shellExecutor: this.shellExecutor,
                shellPolicy: new ShellCommandPolicyService(
                    this.configService.get().plugins.shell.denyPatterns,
                    this.configService.get().plugins.shell.allowedCwd,
                ),
            }),
            ...(observation && { observation }),
            ...(windowManager && { windowManager }),
            ...(onSuspendRequest && { onSuspendRequest }),
            ...('newTab' in automation && { tabManager: automation as unknown as ITabManager }),
            onCapture: (capturedFrame) => sink.onPerceptionFrame(getActionCount(), capturedFrame),
            ...(input.recording?.enabled && {
                recording: {
                    enabled: true as const,
                    options: {
                        ...(input.recording.maxDurationMs !== undefined && { maxDurationMs: input.recording.maxDurationMs }),
                        ...(input.recording.intervalMs !== undefined && { intervalMs: input.recording.intervalMs }),
                    },
                },
            }),
            onRecording: (recording) => sink.onActionRecording(getActionCount(), recording),
        };
    }
}
