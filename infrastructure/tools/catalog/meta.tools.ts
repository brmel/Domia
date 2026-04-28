import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import { toolError, toolSuccess } from '../toolResult';

export interface CategorySummary {
    readonly name: string;
    readonly description: string;
    readonly toolCount: number;
    readonly toolNames: readonly string[];
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    interaction: 'Click, type, hover, drag, select — element-targeted user actions on the page.',
    mouse: 'Coordinate-based mouse actions for canvases or apps without ARIA refs.',
    navigation: 'URL navigation, scrolling, and tab/window switching.',
    observation: 'Capture page state (ARIA + screenshots), extract text, recall recent observation frames, wait between actions.',
    polling: 'Long-running waits for a condition to become true (URL change, text appearance, frame match).',
    recording: 'Capture rapid DOM mutations to verify transient UI events (toasts, counters, flashes).',
    shell: 'Execute approved shell commands when configured.',
    electron: 'List + switch among Electron application windows.',
    terminal: 'finish (declare task complete) and suspend (pause for later resume).',
};

export function createMetaTools(getCatalog: () => readonly ToolSpec[]): ToolSpec[] {
    return ([
        {
            name: 'list_categories',
            description:
                'List the tool categories available to you, with a one-line description and the names of tools in each. ' +
                'Use this when you need a tool not currently in your prompt — pick a category by name, then call expand_category to see its tools\' parameters. ' +
                'Input: {}. Output: { categories: Array<{ name, description, toolCount, toolNames }> }.',
            actionType: ActionType.LIST_CATEGORIES,
            parameters: z.object({}),
            execute: () => {
                const grouped = new Map<string, ToolSpec[]>();
                for (const tool of getCatalog()) {
                    const key = tool.category ?? 'uncategorized';
                    const list = grouped.get(key) ?? [];
                    list.push(tool);
                    grouped.set(key, list);
                }
                const categories: CategorySummary[] = Array.from(grouped.entries()).map(([name, specs]) => ({
                    name,
                    description: CATEGORY_DESCRIPTIONS[name] ?? `${specs.length} tools.`,
                    toolCount: specs.length,
                    toolNames: specs.map((s) => s.name),
                }));
                return toolSuccess({ categories });
            },
        },
        {
            name: 'expand_category',
            description:
                'Get the full parameter schema and detailed description for every tool in a category. ' +
                'Call this only when you intend to use a tool from this category — it returns enough detail to call any tool by name with the right arguments. ' +
                'Input: { name: string — category name from list_categories }. ' +
                'Output: { tools: Array<{ name, description, parameters }> } or { status: "error" } if the category is unknown.',
            actionType: ActionType.EXPAND_CATEGORY,
            parameters: z.object({
                name: z.string().min(1).describe('Category name (e.g. "interaction", "navigation").'),
            }),
            execute: (args) => {
                const name = args['name'] as string;
                const matches = getCatalog().filter((t) => (t.category ?? 'uncategorized') === name);
                if (matches.length === 0) return toolError(`Unknown category: ${name}`);
                return toolSuccess({
                    tools: matches.map((t) => ({
                        name: t.name,
                        description: t.description,
                        parameters: zodSchemaShape(t.parameters),
                    })),
                });
            },
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'meta' as const }));
}

function zodSchemaShape(schema: { _def?: unknown; shape?: unknown }): Record<string, string> {
    const out: Record<string, string> = {};
    const shape = (schema as { shape?: unknown }).shape;
    if (shape && typeof shape === 'object') {
        for (const key of Object.keys(shape)) {
            const field = (shape as Record<string, { description?: string; _def?: { typeName?: string } }>)[key];
            const typeName = field?._def?.typeName ?? 'unknown';
            const desc = field?.description ?? '';
            out[key] = desc ? `${typeName}: ${desc}` : typeName;
        }
    }
    return out;
}
