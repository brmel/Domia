import type { Part } from '@google/genai';
import type { AgentEvent } from '@domain/ports/agent/IAgentRuntime';
import type { ILogger } from '@domain/ports';
import type { RunMetricsState } from './RunMetricsPlugin';
import type { ActionMapper } from '@infrastructure/agent/ActionMapper';
import type { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { TOOL_TIME_LOG_THRESHOLD_MS } from '@shared/defaults';

const LOG_TAG = '[AdkAgentRuntime]';

export interface StepExecutionState extends RunMetricsState {
    actionCount: number;
    pendingYield: AgentEvent | null;
    llmTurnStartMs: number;
}

export function extractThought(event: { content?: { parts?: Array<{ text?: string }> } }): string {
    if (!event.content?.parts) return '';
    return event.content.parts
        .filter((p): p is { text: string } => typeof p.text === 'string' && p.text.trim().length > 0)
        .map(p => p.text.trim())
        .join('\n');
}

/** Emits the buffered action event, stamping the tool result onto its trace once known. */
export function* flushPending(state: StepExecutionState): Generator<AgentEvent> {
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

export function computeLlmLatency(state: StepExecutionState, logger: ILogger): number {
    const roundTripMs = Date.now() - state.llmTurnStartMs;
    const prevToolMs = state.lastToolResult?.durationMs ?? 0;
    const llmLatencyMs = Math.max(0, roundTripMs - prevToolMs);

    if (prevToolMs > TOOL_TIME_LOG_THRESHOLD_MS) {
        logger.info(`${LOG_TAG} LLM responded in ${llmLatencyMs}ms (tool: ${prevToolMs}ms, round-trip: ${roundTripMs}ms)`);
    } else {
        logger.info(`${LOG_TAG} LLM responded in ${llmLatencyMs}ms`);
    }
    return llmLatencyMs;
}

export function buildActionEvent(
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

export function injectVisionMedia(
    vision: boolean,
    event: { content?: { parts?: Part[] } },
    captureMiddleware: PostActionCaptureMiddleware,
    logger: ILogger,
): void {
    if (!vision || !event.content?.parts?.some((p: Part) => 'functionResponse' in p)) return;

    const media = captureMiddleware.consumeMedia();
    for (const m of media) {
        (event.content!.parts as unknown[]).push({
            inlineData: { data: m.data.toString('base64'), mimeType: m.mimeType },
        });
    }
    if (media.length > 0) {
        logger.info(`${LOG_TAG} Injected ${media.length} screenshot(s) as inlineData into function response event`);
    }
}
