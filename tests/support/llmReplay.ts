import fs from 'fs-extra';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/llm-recordings');

interface RecordedTurn {
    readonly hash: string;
    readonly response: unknown;
}

export class LlmReplay {
    private readonly turns = new Map<string, unknown>();
    private readonly file: string;
    private dirty = false;

    constructor(name: string) {
        this.file = path.join(FIXTURE_DIR, `${name}.json`);
    }

    async load(): Promise<void> {
        await fs.ensureDir(FIXTURE_DIR);
        if (await fs.pathExists(this.file)) {
            const turns: RecordedTurn[] = await fs.readJson(this.file);
            for (const t of turns) this.turns.set(t.hash, t.response);
        }
    }

    peek(hash: string): unknown {
        return this.turns.get(hash);
    }

    poke(hash: string, value: unknown): void {
        this.turns.set(hash, value);
        this.dirty = true;
    }

    get size(): number {
        return this.turns.size;
    }

    async flush(): Promise<void> {
        if (!this.dirty) return;
        const turns: RecordedTurn[] = [...this.turns].map(([hash, response]) => ({ hash, response }));
        await fs.writeJson(this.file, turns, { spaces: 2 });
        this.dirty = false;
    }
}
