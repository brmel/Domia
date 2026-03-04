import { FunctionTool } from '@google/adk';
import type { ToolOptions, ToolInputParameters } from '@google/adk';
import { buildToolCatalog } from '../tools/buildToolCatalog';
import type { ToolDependencies, ToolSpec } from '../tools/ToolSpec';
import type { IPromptService } from '@domain/ports/IPromptService';

function toFunctionTool(spec: ToolSpec): FunctionTool {
    return new FunctionTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        execute: spec.execute,
    } as unknown as ToolOptions<ToolInputParameters>);
}

export function createAdkTools(
    deps: ToolDependencies,
    extraTools: ToolSpec[] = [],
    promptService?: IPromptService,
): { tools: FunctionTool[]; catalog: ToolSpec[] } {
    const catalog = buildToolCatalog(deps, extraTools, promptService);
    return { tools: catalog.map(toFunctionTool), catalog };
}
