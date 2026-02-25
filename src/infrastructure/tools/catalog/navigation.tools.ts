import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';

export function createNavigationTools(automation: IAppAutomation): ToolSpec[] {
    return [
        {
            name: 'scroll',
            description: 'Scroll the viewport by one page-height in the given direction. Use to reveal off-screen content, lazy-loaded sections, or infinite-scroll items.',
            actionType: ActionType.SCROLL,
            capturable: true,
            parameters: z.object({
                direction: z.enum(['up', 'down']).describe('Scroll direction: "up" or "down".'),
            }),
            execute: async (args) => {
                const result = await automation.scroll(args['direction'] as 'up' | 'down');
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return { status: 'success' };
            },
        },
        {
            name: 'navigate',
            description: 'Navigate to an absolute URL. Waits for the page to load then captures DOM and optional screenshot. Use when you need to open a different page, reload, or jump to a deep link.',
            actionType: ActionType.NAVIGATE,
            capturable: true,
            parameters: z.object({
                url: z.string().describe('Absolute URL to navigate to (must include protocol, e.g. https://example.com).'),
            }),
            execute: async (args) => {
                const { UrlFactory } = await import('@domain/value-objects');
                const urlVO = UrlFactory.create(args['url'] as string);
                if (urlVO.isErr()) return { status: 'error', error: `Invalid URL: ${urlVO.error.message}` };
                const result = await automation.navigateTo(urlVO.value);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return { status: 'success' };
            },
        },
    ];
}
