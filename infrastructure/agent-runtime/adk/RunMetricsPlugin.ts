import { BasePlugin, type BaseTool, type ToolContext } from '@google/adk';
import { SpanStatusCode, type Span } from '@opentelemetry/api';
import type { ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';
import type { IRunHealthMonitor } from '@domain/ports/reporting/IRunHealthMonitor';
import type { TraceService } from '@infrastructure/services/TraceService';

const LOG_TAG = '[RunMetricsPlugin]';

export const SESSION_STATE_CURRENT_URL = 'currentUrl';
export const SESSION_STATE_LAST_TOOL = 'lastTool';

export interface RunToolMetrics {
    name: string;
    result: Record<string, unknown>;
    durationMs: number;
}

export interface RunMetricsState {
    lastToolResult: RunToolMetrics | null;
    lastObservedUrl: string;
}

const PERCEPTION_TOOL_NAMES: ReadonlySet<string> = new Set(['observe', 'extract', 'extract_page_content']);

export class RunMetricsPlugin extends BasePlugin {
    private readonly toolTimers = new Map<string, number>();
    private readonly toolSpans = new Map<string, Span>();

    constructor(
        private readonly runId: RunId,
        private readonly state: RunMetricsState,
        private readonly logger: ILogger,
        private readonly healthMonitor: IRunHealthMonitor,
        private readonly trace?: TraceService,
    ) {
        super('RunMetricsPlugin');
    }

    override async beforeToolCallback({ tool }: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: ToolContext }): Promise<Record<string, unknown> | undefined> {
        this.toolTimers.set(tool.name, Date.now());
        const span = this.trace?.startChildSpan(this.runId, `tool.${tool.name}`, { 'tool.name': tool.name });
        if (span) this.toolSpans.set(tool.name, span);
        return undefined;
    }

    override async afterToolCallback({ tool, result, toolContext }: {
        tool: BaseTool;
        toolArgs: Record<string, unknown>;
        toolContext: ToolContext;
        result: Record<string, unknown>;
    }): Promise<Record<string, unknown> | undefined> {
        const startedAt = this.toolTimers.get(tool.name) ?? Date.now();
        const durationMs = Date.now() - startedAt;
        this.toolTimers.delete(tool.name);

        this.state.lastToolResult = { name: tool.name, result, durationMs };
        const observedUrl = (result?.['currentUrl'] ?? result?.['navigatedUrl']) as string | undefined;
        if (observedUrl) {
            this.state.lastObservedUrl = observedUrl;
            toolContext.state.set(SESSION_STATE_CURRENT_URL, observedUrl);
        }
        toolContext.state.set(SESSION_STATE_LAST_TOOL, tool.name);

        if (PERCEPTION_TOOL_NAMES.has(tool.name)) {
            this.healthMonitor.recordPerceptionLatency(this.runId, durationMs);
        }

        const span = this.toolSpans.get(tool.name);
        if (span) {
            const status = result?.['status'];
            span.setAttribute('tool.durationMs', durationMs);
            if (typeof status === 'string') span.setAttribute('tool.status', status);
            span.setStatus({ code: status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK });
            span.end();
            this.toolSpans.delete(tool.name);
        }

        this.logger.debug(`${LOG_TAG} ${tool.name} completed in ${durationMs}ms`, { status: result?.['status'] });
        return undefined;
    }
}
