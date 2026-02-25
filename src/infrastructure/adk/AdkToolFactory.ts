import { FunctionTool } from '@google/adk';
import type { ToolOptions, ToolInputParameters } from '@google/adk';
import { buildToolCatalog } from '../tools/buildToolCatalog';
import type { ToolDependencies, ToolSpec } from '../tools/ToolSpec';

function toFunctionTool(spec: ToolSpec): FunctionTool {
    return new FunctionTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        execute: spec.execute,
    } as unknown as ToolOptions<ToolInputParameters>);
}

export function createAdkTools(deps: ToolDependencies): { tools: FunctionTool[]; catalog: ToolSpec[] } {
    const catalog = buildToolCatalog(deps);
    return { tools: catalog.map(toFunctionTool), catalog };
}
