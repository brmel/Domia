import { inject, injectable } from 'tsyringe';
import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { IEventBus } from '@domain/ports/IEventBus';
import type { ILogger } from '@domain/ports';
import { APP_NAME } from '@shared/defaults/identity.defaults';

const OTEL_ENDPOINT_VAR = 'DOMIA_OTEL_ENDPOINT';
const TRACER_NAME = 'domia.events';

@injectable()
export class OtelEventExporter {
    private tracer: Tracer | null = null;

    constructor(
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    install(): void {
        const endpoint = process.env[OTEL_ENDPOINT_VAR];
        if (!endpoint) {
            this.logger.debug(`[OtelEventExporter] ${OTEL_ENDPOINT_VAR} not set; OTel export disabled`);
            return;
        }

        const exporter = new OTLPTraceExporter({ url: endpoint });
        const provider = new NodeTracerProvider({
            spanProcessors: [new BatchSpanProcessor(exporter)],
        });
        provider.register();

        this.tracer = trace.getTracer(TRACER_NAME, APP_NAME);
        this.subscribe();
        this.logger.info(`[OtelEventExporter] Exporting domain events to ${endpoint}`);
    }

    private subscribe(): void {
        this.events.on('run.started', (e) => {
            this.spanFor('run.started', { 'run.id': String(e.runId), 'run.url': e.url });
        });
        this.events.on('run.completed', (e) => {
            this.spanFor('run.completed', { 'run.id': String(e.runId), 'run.success': e.success, 'run.summary': e.summary });
        });
        this.events.on('run.failed', (e) => {
            this.spanFor('run.failed', { 'run.id': String(e.runId), 'run.error': e.error }, e.error);
        });
        this.events.on('run.cancelled', (e) => {
            this.spanFor('run.cancelled', { 'run.id': String(e.runId) });
        });
        this.events.on('plugin.loaded', (e) => {
            this.spanFor('plugin.loaded', {
                'plugin.name': e.name,
                'plugin.version': e.version,
                'plugin.description': e.description,
                'plugin.tool_count': e.toolCount,
            });
        });
        this.events.on('config.changed', (e) => {
            this.spanFor('config.changed', { 'config.keys': [...e.keys] });
        });
    }

    private spanFor(name: string, attrs: Record<string, string | number | boolean | string[]>, errorMessage?: string): void {
        if (!this.tracer) return;
        const span = this.tracer.startSpan(name, { attributes: attrs });
        if (errorMessage) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        }
        span.end();
    }
}
