import { BasePlugin, type BaseTool, type ToolContext } from '@google/adk';
import type { ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';
import type { RunHealthMonitorService } from '@backend/runs/RunHealthMonitorService';

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

    constructor(
        private readonly runId: RunId,
        private readonly state: RunMetricsState,
        private readonly logger: ILogger,
        private readonly healthMonitor: RunHealthMonitorService,
    ) {
        super('RunMetricsPlugin');
    }

    override async beforeToolCallback({ tool }: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: ToolContext }): Promise<Record<string, unknown> | undefined> {
        this.toolTimers.set(tool.name, Date.now());
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

        this.logger.debug(`${LOG_TAG} ${tool.name} completed in ${durationMs}ms`, { status: result?.['status'] });
        return undefined;
    }
}
