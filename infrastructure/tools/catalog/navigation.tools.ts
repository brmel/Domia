import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums';
import { UrlFactory } from '@domain/value-objects';
import type { ToolSpec } from '../ToolSpec';
import { unwrapResult, toolError, toolSuccess } from '../toolResult';
import { navigationTimeoutMsParam, timeoutOption, readinessFields } from './pageReadiness';

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
            description: 'Navigate to an absolute URL. Waits for the page to load then captures DOM and optional screenshot. Input: { url: string, timeoutMs?: number }. URL must include protocol (e.g. https://example.com). Output: { status: "success", loadComplete, networkIdle, waitedMs } — loadComplete=false means the page is still loading (slow site); wait for content or retry with a higher timeoutMs. Errors return { status: "error", error: string }.',
            actionType: ActionType.NAVIGATE,
            parameters: z.object({
                url: z.string().describe('Absolute URL to navigate to (must include protocol, e.g. https://example.com).'),
                timeoutMs: navigationTimeoutMsParam,
            }),
            execute: async (args) => {
                const urlVO = UrlFactory.create(args['url'] as string);
                if (urlVO.isErr()) return toolError(`Invalid URL: ${urlVO.error.message}`);
                const result = await automation.navigateTo(urlVO.value, timeoutOption(args));
                if (result.isErr()) return toolError(result.error.message);
                return toolSuccess(readinessFields(result.value));
            },
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'navigation' as const }));
}
