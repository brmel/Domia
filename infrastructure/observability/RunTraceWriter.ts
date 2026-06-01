import { inject, injectable } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { PathsConfigProvider } from '@shared/contracts/config';

interface TraceLine {
    readonly ts: number;
    readonly event: string;
    readonly [key: string]: unknown;
}

/**
 * On run termination, writes <artifactsDir>/<runId>/trace.jsonl — one line per
 * lifecycle/step event. The offline, jq-readable twin of the OTLP span tree.
 * Best-effort: a write failure is logged, never thrown.
 */
@injectable()
export class RunTraceWriter {
    private readonly buffers = new Map<string, TraceLine[]>();

    constructor(
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('PathsConfigProvider') private readonly paths: PathsConfigProvider,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    install(): void {
        this.events.on('run.started', (e) => this.begin(String(e.runId), { event: 'run.started', url: e.url }));
        this.events.on('step.persisted', (e) => this.append(String(e.runId), { event: 'agentic_step', stepNumber: e.stepNumber, action: e.action.type }));
        this.events.on('agent.outcome', (e) => this.append(String(e.runId), { event: 'agent.outcome', kind: e.outcome.kind }));
        this.events.on('observation.frame', (e) => this.append(String(e.frame.runId), { event: 'observation.frame', source: e.frame.source, summaryChars: e.frame.summary.length }));
        this.events.on('run.degraded', (e) => this.append(String(e.runId), { event: 'run.degraded', metric: e.metric, baselineMs: e.baselineMs, currentMs: e.currentMs }));
        this.events.on('run.suspended', (e) => this.append(String(e.runId), { event: 'run.suspended', reason: e.reason }));
        this.events.on('run.resumed', (e) => this.append(String(e.runId), { event: 'run.resumed' }));
        this.events.on('run.completed', (e) => { void this.finish(String(e.runId), { event: 'run.completed', success: e.success, summary: e.summary }); });
        this.events.on('run.failed', (e) => { void this.finish(String(e.runId), { event: 'run.failed', error: e.error }); });
        this.events.on('run.cancelled', (e) => { void this.finish(String(e.runId), { event: 'run.cancelled' }); });
    }

    private bufferFor(runId: string): TraceLine[] {
        const existing = this.buffers.get(runId);
        if (existing) return existing;
        const created: TraceLine[] = [];
        this.buffers.set(runId, created);
        return created;
    }

    private begin(runId: string, line: Omit<TraceLine, 'ts'>): void {
        this.buffers.set(runId, []);
        this.append(runId, line);
    }

    private append(runId: string, line: Omit<TraceLine, 'ts'>): void {
        this.bufferFor(runId).push({ ts: Date.now(), ...line });
    }

    private async finish(runId: string, line: Omit<TraceLine, 'ts'>): Promise<void> {
        this.append(runId, line);
        const lines = this.buffers.get(runId) ?? [];
        this.buffers.delete(runId);
        try {
            const dir = path.join(this.paths().artifactsDir, runId);
            await fs.ensureDir(dir);
            const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
            await fs.writeFile(path.join(dir, 'trace.jsonl'), body, 'utf8');
        } catch (e) {
            this.logger.warn(`[RunTraceWriter] Failed to write trace for ${runId}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
