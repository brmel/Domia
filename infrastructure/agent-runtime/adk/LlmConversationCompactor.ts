import type { BaseLlm, LlmRequest } from '@google/adk';
import type {
    IConversationCompactor,
    ConversationTurn,
    CompactionDecision,
} from '@domain/ports/IConversationCompactor';
import type { IPromptService } from '@domain/ports/IPromptService';
import { PromptKey } from '@domain/ports/IPromptService';
import {
    COMPACTION_TOKEN_THRESHOLD,
    COMPACTION_KEEP_RECENT_TURNS,
    TOKENS_PER_CHAR_ESTIMATE,
} from '@shared/defaults';

export class LlmConversationCompactor implements IConversationCompactor {
    constructor(
        private readonly llm: BaseLlm,
        private readonly promptService: IPromptService,
        private readonly threshold = COMPACTION_TOKEN_THRESHOLD,
        private readonly keepRecent = COMPACTION_KEEP_RECENT_TURNS,
    ) {}

    decide(turns: readonly ConversationTurn[]): CompactionDecision {
        const totalChars = turns.reduce((sum, t) => sum + t.text.length, 0);
        const estimatedTokens = Math.ceil(totalChars * TOKENS_PER_CHAR_ESTIMATE);
        return {
            shouldCompact: estimatedTokens > this.threshold && turns.length > this.keepRecent + 2,
            estimatedTokens,
        };
    }

    async compact(turns: readonly ConversationTurn[]): Promise<readonly ConversationTurn[]> {
        if (turns.length <= this.keepRecent) return turns;

        const olderTurns = turns.slice(0, turns.length - this.keepRecent);
        const recentTurns = turns.slice(turns.length - this.keepRecent);
        const transcript = olderTurns.map((t) => `[${t.role}] ${t.text}`).join('\n\n');

        const prompt = this.promptService.renderPrompt(PromptKey.ConversationCompaction, {
            turns: transcript,
            maxChars: 2000,
        });

        const summary = await this.callLlm(prompt);

        const summaryTurn: ConversationTurn = {
            role: 'user',
            text: `[CONTEXT — earlier turns compacted]\n${summary}`,
        };
        return [summaryTurn, ...recentTurns];
    }

    private async callLlm(prompt: string): Promise<string> {
        const request: LlmRequest = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        } as unknown as LlmRequest;
        let collected = '';
        for await (const response of this.llm.generateContentAsync(request, false)) {
            const parts = (response as { content?: { parts?: Array<{ text?: string }> } }).content?.parts ?? [];
            for (const p of parts) {
                if (typeof p.text === 'string') collected += p.text;
            }
        }
        return collected.trim();
    }
}
