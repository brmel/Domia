import type { Result } from 'neverthrow';
import type { IBrowserAutomation } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import type { ToolContext } from '@domain/tools/Tool';

export interface ToolExecutionContext {
    readonly browser: IBrowserAutomation;
    readonly currentUrl: string;
    readonly toolContext?: ToolContext;
}

export interface ToolExecutor {
    execute(action: AgentAction, context: ToolExecutionContext): Promise<Result<void, Error>>;
}
