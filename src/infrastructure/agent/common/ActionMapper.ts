import type { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '@infrastructure/tools/ToolSpec';
import { DEFAULT_WAIT_DURATION_MS, DEFAULT_POLL_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS, DEFAULT_SHELL_TIMEOUT_MS } from '@shared/defaults';

const TOOL_DEFAULTS: Readonly<Record<string, Record<string, unknown>>> = {
    type: { submit: false },
    mouse_scroll: { deltaX: 0 },
    wait: { durationMs: DEFAULT_WAIT_DURATION_MS },
    waitForCondition: { timeoutMs: DEFAULT_POLL_TIMEOUT_MS, pollIntervalMs: DEFAULT_POLL_INTERVAL_MS },
    pass: { summary: 'Task completed successfully' },
    fail: { reason: 'Unknown failure' },
    shell_exec: { timeoutMs: DEFAULT_SHELL_TIMEOUT_MS },
};

export class ActionMapper {
    private readonly byName: ReadonlyMap<string, ToolSpec>;

    constructor(catalog: readonly ToolSpec[]) {
        this.byName = new Map(catalog.map((s) => [s.name, s]));
    }

    map(toolName: string, args: Record<string, unknown>, thought: string): AgentAction {
        const spec = this.byName.get(toolName);
        if (!spec) {
            return { type: ActionType.FAIL, reason: `Unknown tool: ${toolName}`, thought } as AgentAction;
        }
        const { capture: _capture, captureDelayMs: _captureDelayMs, ...cleanArgs } = args;
        const defaults = TOOL_DEFAULTS[toolName];
        const merged = defaults ? { ...defaults, ...cleanArgs } : cleanArgs;
        return { type: spec.actionType, ...merged, thought } as AgentAction;
    }
}
