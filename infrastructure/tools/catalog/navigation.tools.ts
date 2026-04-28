import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums';
import { UrlFactory } from '@domain/value-objects';
import type { ToolSpec } from '../ToolSpec';
import { unwrapResult, toolError } from '../toolResult';

export function createNavigationTools(automation: IAppAutomation): ToolSpec[] {
    return ([
        {
            name: 'scroll',
            description: 'Scroll the viewport by one page-height in the given direction. Use to reveal off-screen content, lazy-loaded sections, or infinite-scroll items. Input: { direction: "up" | "down" }. Output: { status: "success" } with updated DOM elements and optional screenshot, or { status: "error", error: string }.',
            actionType: ActionType.SCROLL,
            parameters: z.object({
                direction: z.enum(['up', 'down']).describe('Scroll direction: "up" or "down".'),
            }),
            execute: async (args) => unwrapResult(
                await automation.scroll(args['direction'] as 'up' | 'down'),
            ),
        },
        {
            name: 'navigate',
            description: 'Navigate to an absolute URL. Waits for the page to load then captures DOM and optional screenshot. Input: { url: string }. URL must include protocol (e.g. https://example.com). Output: { status: "success" } with updated page state, or { status: "error", error: string }.',
            actionType: ActionType.NAVIGATE,
            parameters: z.object({
                url: z.string().describe('Absolute URL to navigate to (must include protocol, e.g. https://example.com).'),
            }),
            execute: async (args) => {
                const urlVO = UrlFactory.create(args['url'] as string);
                if (urlVO.isErr()) return toolError(`Invalid URL: ${urlVO.error.message}`);
                const result = await automation.navigateTo(urlVO.value);
                return unwrapResult(result);
            },
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'navigation' as const }));
}
