import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { TraceService } from './TraceService';
import type { ITraceExporter } from './ITraceExporter';

describe('TraceService hardening', () => {
    it('deduplicates exporters by name', async () => {
        const service = new TraceService();
        const exportFn = vi.fn().mockResolvedValue(undefined);

        const exporter: ITraceExporter = {
            name: 'same-exporter',
            export: exportFn
        };

        service.addExporter(exporter);
        service.addExporter(exporter);

        await service.tracePerception('run-1', 1, { timestamp: Date.now() });

        expect(exportFn).toHaveBeenCalledTimes(1);
    });

    it('isolates exporter failures and continues tracing', async () => {
        const service = new TraceService();
        const failing = {
            name: 'failing',
            export: vi.fn().mockRejectedValue(new Error('boom'))
        } satisfies ITraceExporter;

        const healthy = {
            name: 'healthy',
            export: vi.fn().mockResolvedValue(undefined)
        } satisfies ITraceExporter;

        service.addExporter(failing);
        service.addExporter(healthy);

        await expect(service.traceReasoning('run-2', 2, { timestamp: Date.now() })).resolves.toBeUndefined();
        expect(healthy.export).toHaveBeenCalledTimes(1);
    });
});
