/**
 * Thin ADK adapter: converts framework-agnostic BrowserToolSpecs into
 * Google ADK FunctionTool instances.
 *
 * All tool definitions, parameter schemas, and execute logic live in
 * BrowserToolCatalog. This file only handles the ADK-specific wrapping.
 */

import { FunctionTool } from '@google/adk';
import type { ToolOptions, ToolInputParameters } from '@google/adk';
import {
    createBrowserToolCatalog,
    formatElements,
    type BrowserToolDependencies,
    type BrowserToolSpec,
} from '../tools/BrowserToolCatalog';

// Re-export for consumers that imported from this module before the refactor.
export { formatElements };
export type { BrowserToolDependencies as AdkToolDependencies };

// Bypass Zod version mismatch (project Zod 3.25 vs ADK Zod 4.x).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFunctionTool(spec: BrowserToolSpec): FunctionTool {
    return new FunctionTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        execute: spec.execute,
    } as unknown as ToolOptions<ToolInputParameters>);
}

/**
 * Creates ADK FunctionTool instances for all browser actions.
 */
export function createAdkBrowserTools(deps: BrowserToolDependencies): FunctionTool[] {
    return createBrowserToolCatalog(deps).map(toFunctionTool);
}
