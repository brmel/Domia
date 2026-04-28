export interface ConversationSnapshot {
    readonly providerKind: string;
    readonly capturedAt: number;
    readonly events: unknown;
}
