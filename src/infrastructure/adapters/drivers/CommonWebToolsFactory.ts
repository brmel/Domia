import { ResultAsync } from 'neverthrow';
import { z } from 'zod';
import { Page } from 'playwright';
import { ToolDefinition, ActionResult } from '../../../domain/tools';
import { TOOL_TIMEOUTS, SCROLL_CONSTANTS } from '../../../domain/constants/PlatformConstants';

/**
 * CommonWebToolsFactory
 * 
 * Factory for creating common web interaction tools that work across platforms.
 * Follows the Factory Pattern to reduce code duplication between WebDriver and ElectronDriver.
 * 
 * These tools work on any platform that provides a Playwright Page interface:
 * - Web browsers via Playwright
 * - Electron apps via CDP
 * - Potentially other Chromium-based platforms
 */
export class CommonWebToolsFactory {
    /**
     * Creates a click_element tool
     * 
     * @param pageProvider - Function that returns the current Page to interact with
     * @param supportsWindowSelection - Whether this platform supports selecting specific windows
     * @returns ToolDefinition for clicking elements
     */
    static createClickTool(
        pageProvider: (windowId?: string) => Promise<Page | null>,
        supportsWindowSelection: boolean = false
    ): ToolDefinition {
        const schema = supportsWindowSelection
            ? z.object({
                elementId: z.number(),
                windowId: z.string().optional()
            })
            : z.object({ elementId: z.number() });

        return {
            name: 'click_element',
            description: 'Click on an element identified by its ID',
            schema,
            execute: (params: { elementId: number; windowId?: string }) => {
                return ResultAsync.fromPromise(
                    (async (): Promise<ActionResult> => {
                        const page = await pageProvider(params.windowId);
                        if (!page) {
                            return { success: false, error: 'No page available' };
                        }

                        const selector = `[data-domia-id="${params.elementId}"]`;
                        await page.click(selector, { timeout: TOOL_TIMEOUTS.CLICK_MS });
                        return { success: true, message: `Clicked element ${params.elementId}` };
                    })(),
                    (e) => new Error(`Click failed: ${e}`)
                );
            }
        };
    }

    /**
     * Creates a type_text tool
     * 
     * @param pageProvider - Function that returns the current Page to interact with
     * @param supportsWindowSelection - Whether this platform supports selecting specific windows
     * @returns ToolDefinition for typing text
     */
    static createTypeTool(
        pageProvider: (windowId?: string) => Promise<Page | null>,
        supportsWindowSelection: boolean = false
    ): ToolDefinition {
        const schema = supportsWindowSelection
            ? z.object({
                elementId: z.number(),
                text: z.string(),
                submit: z.boolean().optional(),
                windowId: z.string().optional()
            })
            : z.object({
                elementId: z.number(),
                text: z.string(),
                submit: z.boolean().optional()
            });

        return {
            name: 'type_text',
            description: 'Type text into an input element',
            schema,
            execute: (params: { elementId: number; text: string; submit?: boolean; windowId?: string }) => {
                return ResultAsync.fromPromise(
                    (async (): Promise<ActionResult> => {
                        const page = await pageProvider(params.windowId);
                        if (!page) {
                            return { success: false, error: 'No page available' };
                        }

                        const selector = `[data-domia-id="${params.elementId}"]`;
                        await page.fill(selector, params.text, { timeout: TOOL_TIMEOUTS.TYPE_MS });

                        if (params.submit) {
                            await page.press(selector, 'Enter');
                        }

                        return { success: true, message: `Typed into element ${params.elementId}` };
                    })(),
                    (e) => new Error(`Type failed: ${e}`)
                );
            }
        };
    }

    /**
     * Creates a scroll_page tool
     * 
     * @param pageProvider - Function that returns the current Page to interact with
     * @param supportsWindowSelection - Whether this platform supports selecting specific windows
     * @returns ToolDefinition for scrolling
     */
    static createScrollTool(
        pageProvider: (windowId?: string) => Promise<Page | null>,
        supportsWindowSelection: boolean = false
    ): ToolDefinition {
        const schema = supportsWindowSelection
            ? z.object({
                direction: z.enum(['up', 'down']),
                windowId: z.string().optional()
            })
            : z.object({ direction: z.enum(['up', 'down']) });

        return {
            name: 'scroll_page',
            description: 'Scroll the page up or down',
            schema,
            execute: (params: { direction: 'up' | 'down'; windowId?: string }) => {
                return ResultAsync.fromPromise(
                    (async (): Promise<ActionResult> => {
                        const page = await pageProvider(params.windowId);
                        if (!page) {
                            return { success: false, error: 'No page available' };
                        }

                        const scrollAmount = params.direction === 'down'
                            ? SCROLL_CONSTANTS.AMOUNT_PX
                            : -SCROLL_CONSTANTS.AMOUNT_PX;

                        await page.evaluate((amount: number) => {
                            window.scrollBy(0, amount);
                        }, scrollAmount);

                        return { success: true, message: `Scrolled ${params.direction}` };
                    })(),
                    (e) => new Error(`Scroll failed: ${e}`)
                );
            }
        };
    }

    /**
     * Creates a wait tool
     * 
     * @returns ToolDefinition for waiting
     */
    static createWaitTool(): ToolDefinition {
        return {
            name: 'wait',
            description: 'Wait for a specified duration in milliseconds',
            schema: z.object({ durationMs: z.number().min(0).max(60000) }), // Max 1 minute
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
        };
    }

    /**
     * Creates a navigate_to tool (only applicable for web platforms with URL navigation)
     * 
     * @param navigateFunction - Function that performs the navigation
     * @returns ToolDefinition for navigation
     */
    static createNavigateTool(
        navigateFunction: (url: string) => Promise<void>
    ): ToolDefinition {
        return {
            name: 'navigate_to',
            description: 'Navigate to a URL',
            schema: z.object({ url: z.string().url() }),
            execute: (params: { url: string }) => {
                return ResultAsync.fromPromise(
                    (async (): Promise<ActionResult> => {
                        await navigateFunction(params.url);
                        return { success: true, message: `Navigated to ${params.url}` };
                    })(),
                    (e) => new Error(`Navigation failed: ${e}`)
                );
            }
        };
    }

    /**
     * Creates all common web tools for a platform
     * 
     * @param executeInWindow - Function to execute actions in a specific window context
     * @returns Array of all common ToolDefinitions
     */
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
                }),
                execute: (params: { elementId: number; windowId?: string }) => {
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
                schema: z.object({ durationMs: z.number().min(0).max(60000) }), // Max 1 minute
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
