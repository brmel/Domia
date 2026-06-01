import { injectable, inject } from 'tsyringe';
import { InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Event } from '@google/adk';
import {
    extractThought,
    flushPending,
    computeLlmLatency,
    buildActionEvent,
    injectVisionMedia,
} from './adkEventMapping';
import type { IAdkLlmFactory } from './IAdkLlmFactory';
import type { IRunHealthMonitor } from '@domain/ports/reporting/IRunHealthMonitor';
import { SkillRunnerService } from '@infrastructure/skills/SkillRunnerService';
import type { IStructuredAutomation, IPerceptionPipeline, ILogger, IStorageService } from '@domain/ports';
import type { IAgentRuntime, AgentEvent, AgentOutcome, AgentInput } from '@domain/ports/agent/IAgentRuntime';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';
import type { IPromptService } from '@domain/ports/agent/IPromptService';
import { ActionType } from '@domain/enums';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { TraceService } from '@infrastructure/services/TraceService';
import type { IConfigService } from '@domain/ports/platform/IConfigService';
import { LLM_CALL_BUDGET_OFFSET, FINAL_RESPONSE_LOG_CHARS, APP_NAME } from '@shared/defaults';
import { assembleAdkSession } from './assembleAdkSession';
import { ADK_SNAPSHOT_PROVIDER, ADK_SESSION_USER_ID } from './adkConstants';

const LOG_TAG = '[AdkAgentRuntime]';

/** Cumulative token estimate from ADK usage metadata; over-counts re-sent prompt, so a conservative upper bound (a budget stops at-or-before real usage). */
function readUsageTokens(event: unknown): number {
    const usage = (event as { usageMetadata?: { totalTokenCount?: number } }).usageMetadata;
    return typeof usage?.totalTokenCount === 'number' ? usage.totalTokenCount : 0;
}

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
        @inject(TraceService) private readonly trace: TraceService,
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
        const setup = await assembleAdkSession({
            perception: this.perception,
            storage: this.storage,
            logger: this.logger,
            llmConfigResolver: this.llmConfigResolver,
            pluginRegistry: this.pluginRegistry,
            promptService: this.promptService,
            shellExecutor: this.shellExecutor,
            configService: this.configService,
            llmFactory: this.llmFactory,
            skillRunner: this.skillRunner,
            healthMonitor: this.healthMonitor,
            sessionService: this.sessionService,
            trace: this.trace,
        }, input, automation);
        if (setup.kind === 'error') return setup;
        const { state, captureMiddleware, actionMapper, runner, session, initialMessage, sink } = setup;
        const { stepGoal, maxActions, vision, budget } = input;

        const runStartMs = Date.now();
        let estimatedTokens = 0;

        try {
            state.llmTurnStartMs = Date.now();

            for await (const event of runner.runAsync({
                userId: session.userId,
                sessionId: session.id,
                newMessage: initialMessage,
                runConfig: { maxLlmCalls: maxActions + LLM_CALL_BUDGET_OFFSET },
            })) {
                estimatedTokens += readUsageTokens(event);

                if (budget?.maxDurationMs && Date.now() - runStartMs > budget.maxDurationMs) {
                    yield* flushPending(state);
                    this.logger.info(`${LOG_TAG} Duration budget (${budget.maxDurationMs}ms) reached after ${state.actionCount} action(s).`);
                    return { kind: 'stopped', reason: 'budget_exhausted', summary: `Max duration (${budget.maxDurationMs}ms) reached for step: ${stepGoal}` };
                }
                if (budget?.maxTokens && estimatedTokens > budget.maxTokens) {
                    yield* flushPending(state);
                    this.logger.info(`${LOG_TAG} Token budget (${budget.maxTokens}) reached (~${estimatedTokens}) after ${state.actionCount} action(s).`);
                    return { kind: 'stopped', reason: 'budget_exhausted', summary: `Max tokens (${budget.maxTokens}) reached for step: ${stepGoal}` };
                }

                const functionCalls = getFunctionCalls(event);
                const thought = extractThought(event);

                if (thought && !functionCalls?.length && !isFinalResponse(event)) {
                    yield { type: 'thinking_chunk', text: thought };
                }

                if (functionCalls?.length) {
                    const llmLatencyMs = computeLlmLatency(state, this.logger);

                    for (const fc of functionCalls) {
                        yield* flushPending(state);

                        const action = actionMapper.map(fc.name!, fc.args as Record<string, unknown>, thought);
                        state.actionCount++;
                        this.logger.info(`${LOG_TAG} Action ${state.actionCount}/${maxActions}: ${fc.name}`, fc.args);

                        const actionEvent = buildActionEvent(action, state, stepGoal, maxActions, llmLatencyMs, thought, event, fc);

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

                injectVisionMedia(vision, event, captureMiddleware, this.logger);

                if (isFinalResponse(event)) {
                    yield* flushPending(state);
                    const text = stringifyContent(event);
                    this.logger.info(`${LOG_TAG} Final response: ${text.slice(0, FINAL_RESPONSE_LOG_CHARS)}`);
                    return {
                        kind: 'done',
                        output: { summary: text || `Completed ${state.actionCount} action(s).` },
                    };
                }
            }

            yield* flushPending(state);
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

}
