import type { LlmRequest } from '@google/adk';
import type { ConversationTurn, IConversationCompactor } from '@domain/ports/agent/IConversationCompactor';
import type { ILogger } from '@domain/ports';

const LOG_TAG = '[CompactionCallback]';

interface AdkContent { role?: string; parts?: Array<{ text?: string }> }

export function buildCompactionCallback(
    compactor: IConversationCompactor,
    logger: ILogger,
): (params: { request: LlmRequest }) => Promise<undefined> {
    return async ({ request }) => {
        const contents = (request.contents ?? []) as AdkContent[];
        const turns = extractTurns(contents);
        const decision = compactor.decide(turns);
        if (!decision.shouldCompact) return undefined;

        const compacted = await compactor.compact(turns);
        request.contents = compacted.map((t) => ({
            role: t.role === 'model' ? 'model' : 'user',
            parts: [{ text: t.text }],
        }));
        logger.info(`${LOG_TAG} Compacted ${turns.length} → ${compacted.length} turns (~${decision.estimatedTokens} tokens)`);
        return undefined;
    };
}

function extractTurns(contents: readonly AdkContent[]): readonly ConversationTurn[] {
    return contents.map((c) => ({
        role: (c.role === 'model' ? 'model' : c.role === 'user' ? 'user' : 'tool') as ConversationTurn['role'],
        text: (c.parts ?? []).map((p) => p.text ?? '').join(' '),
    }));
}
