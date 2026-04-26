import fs from 'fs-extra';
import { createHash } from 'node:crypto';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/llm-recordings');

export type ReplayMode = 'record' | 'replay' | 'auto';

interface RecordedTurn {
    readonly hash: string;
    readonly response: unknown;
}

export class LlmReplay {
    private readonly turns = new Map<string, unknown>();
    private readonly file: string;
    private dirty = false;

    constructor(name: string, private readonly mode: ReplayMode = 'auto') {
        this.file = path.join(FIXTURE_DIR, `${name}.json`);
    }

    async load(): Promise<void> {
        await fs.ensureDir(FIXTURE_DIR);
        if (await fs.pathExists(this.file)) {
            const turns: RecordedTurn[] = await fs.readJson(this.file);
            for (const t of turns) this.turns.set(t.hash, t.response);
        }
    }

    hash(prompt: string, tools: readonly string[]): string {
        return createHash('sha256').update(prompt + '\n' + tools.join('|')).digest('hex').slice(0, 16);
    }

    async resolve(hash: string, generator: () => Promise<unknown>): Promise<unknown> {
        const cached = this.turns.get(hash);
        if (cached !== undefined) return cached;
        if (this.mode === 'replay') throw new Error(`No replay fixture for hash ${hash}`);
        const fresh = await generator();
        this.turns.set(hash, fresh);
        this.dirty = true;
        return fresh;
    }

    async flush(): Promise<void> {
        if (!this.dirty) return;
        const turns: RecordedTurn[] = [...this.turns].map(([hash, response]) => ({ hash, response }));
        await fs.writeJson(this.file, turns, { spaces: 2 });
        this.dirty = false;
    }
}
