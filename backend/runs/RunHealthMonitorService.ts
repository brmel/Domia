import { inject, injectable } from 'tsyringe';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { IRunHealthMonitor } from '@domain/ports/reporting/IRunHealthMonitor';
import type { RunId } from '@domain/value-objects';

const ROLLING_WINDOW = 5;
const DEGRADATION_FACTOR = 3;
const MIN_BASELINE_MS = 50;

interface RunHealth {
    samples: number[];
    baselineMs: number | null;
    degradedAlready: boolean;
}

@injectable()
export class RunHealthMonitorService implements IRunHealthMonitor {
    private readonly perRun = new Map<string, RunHealth>();

    constructor(
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {
        this.events.on('run.completed', (e) => this.forget(e.runId));
        this.events.on('run.failed', (e) => this.forget(e.runId));
        this.events.on('run.cancelled', (e) => this.forget(e.runId));
    }

    recordPerceptionLatency(runId: RunId, ms: number): void {
        let health = this.perRun.get(runId);
        if (!health) {
            health = { samples: [], baselineMs: null, degradedAlready: false };
            this.perRun.set(runId, health);
        }

        health.samples.push(ms);
        if (health.samples.length > ROLLING_WINDOW) health.samples.shift();
        if (health.samples.length < ROLLING_WINDOW || health.degradedAlready) return;

        const sorted = [...health.samples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)]!;

        if (health.baselineMs === null) {
            health.baselineMs = Math.max(MIN_BASELINE_MS, median);
            return;
        }

        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]!;
        if (p95 > health.baselineMs * DEGRADATION_FACTOR) {
            health.degradedAlready = true;
            this.logger.warn(`[RunHealthMonitor] Run ${runId} degraded: p95=${Math.round(p95)}ms baseline=${Math.round(health.baselineMs)}ms`);
            this.events.emit('run.degraded', {
                runId,
                metric: 'perception_capture_ms',
                baselineMs: Math.round(health.baselineMs),
                currentMs: Math.round(p95),
            });
        }
    }

    forget(runId: RunId): void {
        this.perRun.delete(runId);
    }
}
