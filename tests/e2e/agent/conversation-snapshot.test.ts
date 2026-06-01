import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { AdkAgentRuntime } from '@infrastructure/agent-runtime/adk/AdkAgentRuntime';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';

function buildRuntime(): AdkAgentRuntime {
    const logger = new ConsoleLogger();
    const stub = {} as never;
    return new AdkAgentRuntime(stub, stub, logger, stub, stub, stub, stub, stub, stub, stub, stub, stub);
}

function makeFakeEvent(invocationId: string, author: string, text: string): unknown {
    return {
        id: `evt-${invocationId}`,
        invocationId,
        author,
        actions: { stateDelta: {}, artifactDelta: {}, requestedAuthConfigs: {}, requestedToolConfirmations: {} },
        content: { role: author === 'user' ? 'user' : 'model', parts: [{ text }] },
        timestamp: Date.now(),
    };
}

describe('AdkAgentRuntime conversation snapshot', () => {
    it('returns null snapshot for an unknown runId', async () => {
        const runtime = buildRuntime();
        const snapshot = await runtime.snapshotConversation('nonexistent');
        expect(snapshot).toBeNull();
    });

    it('round-trips conversation events through restore → snapshot', async () => {
        const runtime = buildRuntime();
        const runId = 'run-snap-1';
        const events = [
            makeFakeEvent('inv-1', 'user', 'GOAL: do thing'),
            makeFakeEvent('inv-2', 'app_agent', 'Okay, observing.'),
            makeFakeEvent('inv-3', 'app_agent', 'Done.'),
        ];

        const seed: ConversationSnapshot = {
            providerKind: 'adk-gemini',
            capturedAt: Date.now(),
            events,
        };

        await runtime.restoreConversation(runId, seed);

        const recovered = await runtime.snapshotConversation(runId);
        expect(recovered).not.toBeNull();
        expect(recovered!.providerKind).toBe('adk-gemini');
        expect(Array.isArray(recovered!.events)).toBe(true);
        expect(recovered!.events).toHaveLength(3);
        const recoveredTexts = (recovered!.events as Array<{ content: { parts: Array<{ text: string }> } }>)
            .map((e) => e.content.parts[0]!.text);
        expect(recoveredTexts).toEqual(['GOAL: do thing', 'Okay, observing.', 'Done.']);
    });

    it('rejects snapshots from a different provider', async () => {
        const runtime = buildRuntime();
        const bad: ConversationSnapshot = { providerKind: 'openai', capturedAt: 0, events: [] };
        await expect(runtime.restoreConversation('rx', bad)).rejects.toThrow(/provider/);
    });

    it('rejects snapshots whose events payload is not an array', async () => {
        const runtime = buildRuntime();
        const bad: ConversationSnapshot = { providerKind: 'adk-gemini', capturedAt: 0, events: { not: 'an array' } };
        await expect(runtime.restoreConversation('rx', bad)).rejects.toThrow(/array/);
    });

    it('restoring twice replaces the prior session events', async () => {
        const runtime = buildRuntime();
        const runId = 'run-snap-replace';
        await runtime.restoreConversation(runId, {
            providerKind: 'adk-gemini',
            capturedAt: 1,
            events: [makeFakeEvent('a', 'user', 'first')],
        });
        await runtime.restoreConversation(runId, {
            providerKind: 'adk-gemini',
            capturedAt: 2,
            events: [makeFakeEvent('b', 'user', 'second-a'), makeFakeEvent('c', 'user', 'second-b')],
        });

        const recovered = await runtime.snapshotConversation(runId);
        expect(recovered!.events).toHaveLength(2);
        const texts = (recovered!.events as Array<{ content: { parts: Array<{ text: string }> } }>).map((e) => e.content.parts[0]!.text);
        expect(texts).toEqual(['second-a', 'second-b']);
    });
});
