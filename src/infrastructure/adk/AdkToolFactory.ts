import { FunctionTool, LongRunningFunctionTool } from '@google/adk';
import { buildToolCatalog } from '../tools/buildToolCatalog';
import type { ToolDependencies, ToolSpec } from '../tools/ToolSpec';
import type { PostActionCaptureMiddleware } from '../tools/PostActionCaptureMiddleware';
import type { IPromptService } from '@domain/ports/IPromptService';

/**
 * Convert a ToolSpec to an ADK FunctionTool (or LongRunningFunctionTool).
 *
 * ADK bundles its own Zod; a structural cast through `unknown` bridges
 * the two instances (schemas are 100% compatible at runtime).
 */
function toFunctionTool(spec: ToolSpec): FunctionTool {
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
): { tools: FunctionTool[]; catalog: ToolSpec[]; captureMiddleware: PostActionCaptureMiddleware } {
    const { catalog, captureMiddleware } = buildToolCatalog(deps, extraTools, promptService);
    return { tools: catalog.map(toFunctionTool), catalog, captureMiddleware };
}
