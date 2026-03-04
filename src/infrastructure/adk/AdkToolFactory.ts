import { FunctionTool, LongRunningFunctionTool } from '@google/adk';
import { buildToolCatalog } from '../tools/buildToolCatalog';
import type { ToolDependencies, ToolSpec } from '../tools/ToolSpec';
import type { IPromptService } from '@domain/ports/IPromptService';

/**
 * Convert a ToolSpec to an ADK FunctionTool (or LongRunningFunctionTool).
 *
 * ADK accepts Zod schemas directly via its internal `zodObjectToSchema` and calls
 * `execute(parsedArgs)` with the validated object — matching our ToolSpec contract.
 *
 * NOTE: ADK bundles its own copy of Zod. The private `_cached` property differs
 * between our Zod and ADK's Zod, so a structural-cast through `unknown` is
 * required to bridge the two Zod instances.  At runtime the schemas are 100 %
 * compatible — ADK's `zodObjectToSchema()` handles them identically.
 */
function toFunctionTool(spec: ToolSpec): FunctionTool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters as unknown,
        execute: spec.execute,
    } as ConstructorParameters<typeof FunctionTool>[0];

    if (spec.isLongRunning) {
        return new LongRunningFunctionTool(opts);
    }
    return new FunctionTool(opts);
}

export function createAdkTools(
    deps: ToolDependencies,
    extraTools: ToolSpec[] = [],
    promptService?: IPromptService,
): { tools: FunctionTool[]; catalog: ToolSpec[] } {
    const catalog = buildToolCatalog(deps, extraTools, promptService);
    return { tools: catalog.map(toFunctionTool), catalog };
}
