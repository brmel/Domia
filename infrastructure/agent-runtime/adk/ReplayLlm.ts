import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from '@google/adk';
import { createHash } from 'node:crypto';

export interface ReplayCache {
    get(hash: string): readonly LlmResponse[] | undefined;
    set(hash: string, responses: readonly LlmResponse[]): void;
}

export class ReplayLlm extends BaseLlm {
    constructor(
        model: string,
        private readonly cache: ReplayCache,
        private readonly fallback: BaseLlm | null = null,
    ) {
        super({ model });
    }

    async *generateContentAsync(request: LlmRequest, stream?: boolean): AsyncGenerator<LlmResponse, void> {
        const hash = ReplayLlm.hashRequest(request);
        const cached = this.cache.get(hash);
        if (cached) {
            for (const r of cached) yield r;
            return;
        }
        if (!this.fallback) {
            throw new Error(`[ReplayLlm] No cached response for hash ${hash} and no fallback LLM configured`);
        }
        const captured: LlmResponse[] = [];
        for await (const r of this.fallback.generateContentAsync(request, stream)) {
            captured.push(r);
            yield r;
        }
        this.cache.set(hash, captured);
    }

    async connect(request: LlmRequest): Promise<BaseLlmConnection> {
        if (!this.fallback) {
            throw new Error('[ReplayLlm] connect() requires a fallback LLM');
        }
        return this.fallback.connect(request);
    }

    static hashRequest(request: LlmRequest): string {
        const stable = JSON.stringify({
            contents: stripVolatile(request.contents ?? []),
            tools: (request.config?.tools ?? []).map((t) => JSON.stringify(t)),
        });
        return createHash('sha256').update(stable).digest('hex').slice(0, 16);
    }
}

function stripVolatile(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripVolatile);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === 'id' || k === 'invocationId' || k === 'timestamp') continue;
            out[k] = stripVolatile(v);
        }
        return out;
    }
    return value;
}
