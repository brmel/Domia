import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { IAppDriver, AppCapabilities } from '../../../domain/ports/IAppDriver';
import { AppSnapshot } from '../../../domain/value-objects/AppSnapshot';
import { DOMElement } from '../../../domain/value-objects/DOMSnapshot';
import { ToolDefinition, ActionResult } from '../../../domain/tools';
import { PlaywrightAdapter } from '../browser/PlaywrightAdapter';
import type { ILogger } from '../../../domain/ports';
import { DomScanner } from '../../perception/DomScanner';
import { SmartScrollCapture } from '../../perception/SmartScrollCapture';
import { ElementIdFactory, UrlFactory } from '../../../domain/value-objects/Brand';
import { Platform } from '../../../domain/constants/PlatformConstants';
import { PlatformType, ToolScope } from '../../../domain/tools/ToolMetadata';
import { z } from 'zod';

@injectable()
export class WebDriver implements IAppDriver {
    constructor(
        @inject(PlaywrightAdapter) private playwright: PlaywrightAdapter,
        @inject(DomScanner) private domScanner: DomScanner,
        @inject(SmartScrollCapture) private screenCapture: SmartScrollCapture,
        @inject('ILogger') private logger: ILogger
    ) { }

    connect(config?: { headless?: boolean }): ResultAsync<void, Error> {
        this.logger.debug('[WebDriver] Connecting via PlaywrightAdapter');
        const headless = config?.headless ?? true;
        return this.playwright.launch({ headless })
            .mapErr(e => new Error(`WebDriver connect failed: ${e.message}`));
    }

    async disconnect(): Promise<void> {
        await this.playwright.close();
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: Platform.WEB,
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: false
        };
    }

    async captureSnapshot(): Promise<AppSnapshot> {
        const page = this.playwright.getPage();

        if (!page) {
            throw new Error("WebDriver: Browser not connected or page not available");
        }

        const [rawElements, screenshots] = await Promise.all([
            this.domScanner.scan(page),
            this.screenCapture.capture(page, 1)
        ]);

        const elements: DOMElement[] = rawElements.map(el => ({
            id: ElementIdFactory.unsafe(el.id),
            tag: el.tag,
            role: el.role,
            text: el.text,
            attributes: el.attributes,
            isInteractive: el.isInteractive,
            boundingBox: el.boundingBox ? { ...el.boundingBox } : null
        }));

        const url = page.url();
        const title = await page.title();

        const rootElements = {
            html: {},
            body: {}
        };

        return {
            platform: Platform.WEB,
            url,
            title,
            rootElements,
            elements,
            screenshot: screenshots[0]?.toString('base64'),
            screenshots: screenshots.map(b => b.toString('base64')),
            timestamp: new Date()
        };
    }

    getTools(): ToolDefinition[] {
        this.logger.debug('[WebDriver] Creating web tools');
        const tools: ToolDefinition[] = [
            {
                name: 'click_element',
                description: 'Click on an element identified by its ID',
                schema: z.object({ elementId: z.number() }),
                metadata: {
                    name: 'click_element',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { elementId: number }): ResultAsync<ActionResult, Error> => {
                    const id = ElementIdFactory.unsafe(params.elementId);
                    return this.playwright.click(id).map(() => ({
                        success: true,
                        message: `Clicked element ${id}`
                    } as ActionResult)).mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'type_text',
                description: 'Type text into an input element',
                schema: z.object({ elementId: z.number(), text: z.string(), submit: z.boolean().optional() }),
                metadata: {
                    name: 'type_text',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { elementId: number, text: string, submit?: boolean }): ResultAsync<ActionResult, Error> => {
                    const id = ElementIdFactory.unsafe(params.elementId);
                    return this.playwright.type(id, params.text)
                        .andThen(() => {
                            if (params.submit) {
                                return this.playwright.pressKey('Enter')
                                    .map(() => ({ success: true, message: `Typed into ${id} and submitted` } as ActionResult));
                            }
                            return okAsync({ success: true, message: `Typed into ${id}` } as ActionResult);
                        })
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'scroll_page',
                description: 'Scroll the page up or down',
                schema: z.object({ direction: z.enum(['up', 'down']) }),
                metadata: {
                    name: 'scroll_page',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { direction: 'up' | 'down' }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.scroll(params.direction)
                        .map(() => ({ success: true, message: `Scrolled ${params.direction}` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'mouse_move',
                description: 'Move mouse cursor to viewport coordinates',
                schema: z.object({ x: z.number(), y: z.number() }),
                metadata: {
                    name: 'mouse_move',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { x: number; y: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.mouseMove(params.x, params.y)
                        .map(() => ({ success: true, message: `Moved mouse to (${params.x}, ${params.y})` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'mouse_click_left',
                description: 'Left-click at viewport coordinates',
                schema: z.object({ x: z.number(), y: z.number() }),
                metadata: {
                    name: 'mouse_click_left',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { x: number; y: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.mouseClick(params.x, params.y, 'left')
                        .map(() => ({ success: true, message: `Left-clicked at (${params.x}, ${params.y})` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'mouse_click_right',
                description: 'Right-click at viewport coordinates',
                schema: z.object({ x: z.number(), y: z.number() }),
                metadata: {
                    name: 'mouse_click_right',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { x: number; y: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.mouseClick(params.x, params.y, 'right')
                        .map(() => ({ success: true, message: `Right-clicked at (${params.x}, ${params.y})` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'mouse_double_click',
                description: 'Double-click at viewport coordinates',
                schema: z.object({ x: z.number(), y: z.number() }),
                metadata: {
                    name: 'mouse_double_click',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { x: number; y: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.mouseDoubleClick(params.x, params.y)
                        .map(() => ({ success: true, message: `Double-clicked at (${params.x}, ${params.y})` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'mouse_drag',
                description: 'Drag mouse from source to target viewport coordinates',
                schema: z.object({
                    fromX: z.number(),
                    fromY: z.number(),
                    toX: z.number(),
                    toY: z.number(),
                    steps: z.number().int().min(1).max(100).optional()
                }),
                metadata: {
                    name: 'mouse_drag',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { fromX: number; fromY: number; toX: number; toY: number; steps?: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.mouseDrag(params.fromX, params.fromY, params.toX, params.toY, params.steps)
                        .map(() => ({ success: true, message: `Dragged from (${params.fromX}, ${params.fromY}) to (${params.toX}, ${params.toY})` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'mouse_scroll',
                description: 'Scroll mouse wheel by deltas at current cursor position',
                schema: z.object({ deltaX: z.number().optional(), deltaY: z.number() }),
                metadata: {
                    name: 'mouse_scroll',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { deltaX?: number; deltaY: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.mouseScroll(params.deltaX ?? 0, params.deltaY)
                        .map(() => ({ success: true, message: `Mouse scrolled by (${params.deltaX ?? 0}, ${params.deltaY})` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'navigate_to',
                description: 'Navigate to a URL',
                schema: z.object({ url: z.string() }),
                metadata: {
                    name: 'navigate_to',
                    platforms: ['web'],
                    scope: ToolScope.PLATFORM_SPECIFIC,
                    terminal: false
                },
                execute: (params: { url: string }): ResultAsync<ActionResult, Error> => {
                    const urlResult = UrlFactory.create(params.url);
                    if (urlResult.isErr()) {
                        return errAsync(new Error(urlResult.error.message));
                    }

                    return this.playwright.navigateTo(urlResult.value)
                        .map(() => ({ success: true, message: `Navigated to ${params.url}` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'wait',
                description: 'Wait for a specified duration in milliseconds',
                schema: z.object({ durationMs: z.number() }),
                metadata: {
                    name: 'wait',
                    platforms: ['web'],
                    scope: ToolScope.UNIVERSAL,
                    terminal: false
                },
                execute: (params: { durationMs: number }): ResultAsync<ActionResult, Error> => {
                    return this.playwright.wait(params.durationMs)
                        .map(() => ({ success: true, message: `Waited ${params.durationMs}ms` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            }
        ];
        this.logger.info(`[WebDriver] Created ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
        return tools;
    }

    getPlatform(): PlatformType {
        return 'web';
    }

    getBrowserAutomation(): import('../../../domain/ports').IBrowserAutomation {
        return this.playwright;
    }
}
