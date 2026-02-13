import { ResultAsync } from 'neverthrow';
import { z } from 'zod';
import { Page } from 'playwright';
import { ToolDefinition, ActionResult } from '../../../domain/tools';
import { TOOL_TIMEOUTS, SCROLL_CONSTANTS } from '../../../domain/constants/PlatformConstants';
import { PlatformType, ToolScope } from '@domain/tools/ToolMetadata';

export class CommonWebToolsFactory {
    static createAll(
        executeInWindow: (windowId: string | undefined, action: (page: Page) => Promise<ActionResult>) => Promise<ActionResult>
    ): ToolDefinition[] {
        return [
            {
                name: 'click_element',
                description: 'Click on an element identified by its ID',
                schema: z.object({
                    elementId: z.number(),
                    windowId: z.string().optional()
                }),                metadata: {
                    name: 'click_element',
                    platforms: ['web', 'electron'] as PlatformType[],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },                execute: (params: { elementId: number; windowId?: string }) => {
                    return ResultAsync.fromPromise(
                        executeInWindow(params.windowId, async (page) => {
                            const selector = `[data-domia-id="${params.elementId}"]`;
                            await page.click(selector, { timeout: TOOL_TIMEOUTS.CLICK_MS });
                            return { success: true, message: `Clicked element ${params.elementId}` };
                        }),
                        (e) => new Error(`Click failed: ${e}`)
                    );
                }
            },
            {
                name: 'type_text',
                description: 'Type text into an input element',
                schema: z.object({
                    elementId: z.number(),
                    text: z.string(),
                    submit: z.boolean().optional(),
                    windowId: z.string().optional()
                }),
                metadata: {
                    name: 'type_text',
                    platforms: ['web', 'electron'] as PlatformType[],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { elementId: number; text: string; submit?: boolean; windowId?: string }) => {
                    return ResultAsync.fromPromise(
                        executeInWindow(params.windowId, async (page) => {
                            const selector = `[data-domia-id="${params.elementId}"]`;
                            await page.fill(selector, params.text, { timeout: TOOL_TIMEOUTS.TYPE_MS });

                            if (params.submit) {
                                await page.press(selector, 'Enter');
                            }

                            return { success: true, message: `Typed into element ${params.elementId}` };
                        }),
                        (e) => new Error(`Type failed: ${e}`)
                    );
                }
            },
            {
                name: 'scroll_page',
                description: 'Scroll the page up or down',
                schema: z.object({
                    direction: z.enum(['up', 'down']),
                    windowId: z.string().optional()
                }),
                metadata: {
                    name: 'scroll_page',
                    platforms: ['web', 'electron'] as PlatformType[],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { direction: 'up' | 'down'; windowId?: string }) => {
                    return ResultAsync.fromPromise(
                        executeInWindow(params.windowId, async (page) => {
                            const scrollAmount = params.direction === 'down' 
                                ? SCROLL_CONSTANTS.AMOUNT_PX 
                                : -SCROLL_CONSTANTS.AMOUNT_PX;
                            
                            await page.evaluate((amount) => {
                                window.scrollBy(0, amount);
                            }, scrollAmount);

                            return { success: true, message: `Scrolled ${params.direction}` };
                        }),
                        (e) => new Error(`Scroll failed: ${e}`)
                    );
                }
            },
            {
                name: 'wait',
                description: 'Wait for a specified duration in milliseconds',
                schema: z.object({ durationMs: z.number().min(0).max(60000) }),
                metadata: {
                    name: 'wait',
                    platforms: ['web', 'electron'] as PlatformType[],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { durationMs: number }) => {
                    return ResultAsync.fromPromise(
                        new Promise<ActionResult>(resolve => {
                            setTimeout(() => {
                                resolve({ success: true, message: `Waited ${params.durationMs}ms` });
                            }, params.durationMs);
                        }),
                        (e) => new Error(`Wait failed: ${e}`)
                    );
                }
            }
        ];
    }
}
