import { injectable } from 'tsyringe';
import { trace, context, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';
import { APP_NAME } from '@shared/defaults';
import type { ITraceService } from '@domain/ports/reporting/ITraceService';

const TRACER_NAME = 'domia.run';

/**
 * Real OpenTelemetry tracing for runs. Each run gets a root `agent.run` span with
 * a real duration; tool calls become child spans under it (opened by RunMetricsPlugin
 * via `startChildSpan`). When `DOMIA_OTEL_ENDPOINT` is unset no provider is registered,
 * so the global tracer is a no-op and these spans cost nothing. (W5)
 *
 * `endTrace()` carries no runId (port shape), so it ends the most-recently-started run
 * (LIFO). Child-span lookup is keyed by runId, so concurrent runs still nest correctly;
 * only the LIFO end-ordering is approximate under heavy concurrency.
 */
@injectable()
export class TraceService implements ITraceService {
    private readonly tracer = trace.getTracer(TRACER_NAME, APP_NAME);
    private readonly byRun = new Map<string, { span: Span; ctx: Context }>();
    private readonly stack: string[] = [];

    async startTrace(runId: string): Promise<void> {
        if (this.byRun.has(runId)) return;
        const span = this.tracer.startSpan('agent.run', { attributes: { 'run.id': runId } });
        const ctx = trace.setSpan(context.active(), span);
        this.byRun.set(runId, { span, ctx });
        this.stack.push(runId);
    }

    async endTrace(): Promise<void> {
        const runId = this.stack.pop();
        if (!runId) return;
        const entry = this.byRun.get(runId);
        this.byRun.delete(runId);
        if (!entry) return;
        entry.span.setStatus({ code: SpanStatusCode.OK });
        entry.span.end();
    }

    /** Open a child span under the given run's root span. Returns undefined if the run has no active trace. */
    startChildSpan(runId: string, name: string, attributes: Record<string, string | number | boolean> = {}): Span | undefined {
        const entry = this.byRun.get(runId);
        if (!entry) return undefined;
        return this.tracer.startSpan(name, { attributes }, entry.ctx);
    }
}
