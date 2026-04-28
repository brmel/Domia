export interface ConversationTurn {
    readonly role: 'user' | 'model' | 'tool';
    readonly text: string;
}

export interface CompactionDecision {
    readonly shouldCompact: boolean;
    readonly estimatedTokens: number;
}

export interface IConversationCompactor {
    decide(turns: readonly ConversationTurn[]): CompactionDecision;
    compact(turns: readonly ConversationTurn[]): Promise<readonly ConversationTurn[]>;
}
