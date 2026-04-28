import 'reflect-metadata';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { FileSystemStorage } from '@infrastructure/FileSystemStorage';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';

let tmpRoot: string;

beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-snap-'));
});

afterEach(async () => {
    if (tmpRoot) await fs.remove(tmpRoot);
});

function makeStorage(): FileSystemStorage {
    const provider = (): { artifactsDir: string; recordingsDir: string; reportsDir: string } => ({
        artifactsDir: tmpRoot,
        recordingsDir: tmpRoot,
        reportsDir: tmpRoot,
    });
    return new FileSystemStorage(provider as never);
}

describe('FileSystemStorage conversation snapshot', () => {
    it('saves and loads a snapshot round-trip', async () => {
        const storage = makeStorage();
        const snapshot: ConversationSnapshot = {
            providerKind: 'adk-gemini',
            capturedAt: 1700000000000,
            events: [{ id: 'evt-1', text: 'hello' }],
        };
        const filePath = await storage.saveConversationSnapshot('run-A', snapshot);
        expect(filePath).toContain('run-A');
        expect(filePath).toMatch(/conversation-snapshot\.json$/);

        const loaded = await storage.loadConversationSnapshot(filePath);
        expect(loaded).toEqual(snapshot);
    });

    it('deleteConversationSnapshot removes the file', async () => {
        const storage = makeStorage();
        const snap: ConversationSnapshot = { providerKind: 'adk-gemini', capturedAt: 0, events: [] };
        const filePath = await storage.saveConversationSnapshot('run-B', snap);
        expect(await fs.pathExists(filePath)).toBe(true);
        await storage.deleteConversationSnapshot(filePath);
        expect(await fs.pathExists(filePath)).toBe(false);
    });

    it('deleteConversationSnapshot is a no-op when the file is missing', async () => {
        const storage = makeStorage();
        const fake = path.join(tmpRoot, 'missing', 'conversation-snapshot.json');
        await expect(storage.deleteConversationSnapshot(fake)).resolves.toBeUndefined();
    });

    it('refuses to load snapshots outside the artifacts dir', async () => {
        const storage = makeStorage();
        await expect(storage.loadConversationSnapshot('/etc/passwd')).rejects.toThrow(/outside artifacts dir/);
    });

    it('refuses to delete snapshots outside the artifacts dir', async () => {
        const storage = makeStorage();
        await expect(storage.deleteConversationSnapshot('/etc/something')).rejects.toThrow(/outside artifacts dir/);
    });

    it('overwrites a prior snapshot for the same runId', async () => {
        const storage = makeStorage();
        const first: ConversationSnapshot = { providerKind: 'adk-gemini', capturedAt: 1, events: ['old'] };
        const second: ConversationSnapshot = { providerKind: 'adk-gemini', capturedAt: 2, events: ['new'] };
        const p1 = await storage.saveConversationSnapshot('run-C', first);
        const p2 = await storage.saveConversationSnapshot('run-C', second);
        expect(p1).toBe(p2);
        const loaded = await storage.loadConversationSnapshot(p2);
        expect(loaded.events).toEqual(['new']);
    });
});
