import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync } from 'neverthrow';
import { IAppDriver, AppCapabilities } from '../../../domain/ports/IAppDriver';
import { AppSnapshot } from '../../../domain/value-objects/AppSnapshot';
import { DOMElement } from '../../../domain/value-objects/DOMSnapshot';
import { ToolDefinition, ActionResult } from '../../../domain/tools';
import { PlaywrightAdapter } from '../browser/PlaywrightAdapter';
import type { ILogger } from '../../../domain/ports';
import { DomScanner } from '../../perception/DomScanner';
import { SmartScrollCapture } from '../../perception/SmartScrollCapture';
import { ElementIdFactory } from '../../../domain/value-objects/Brand';
import { Platform } from '../../../domain/constants/PlatformConstants';
import { z } from 'zod';

@injectable()
export class WebDriver implements IAppDriver {
    constructor(
        @inject(PlaywrightAdapter) private playwright: PlaywrightAdapter,
        @inject(DomScanner) private domScanner: DomScanner,
        @inject(SmartScrollCapture) private screenCapture: SmartScrollCapture,
        @inject('ILogger') private logger: ILogger
    ) { }

    connect(config?: any): ResultAsync<void, Error> {
        this.logger.debug('[WebDriver] Connecting via PlaywrightAdapter');
        // Retrieve launch options from config or defaults
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
        const adapter = this.playwright as any;
        const page = adapter.page;

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
        return [
            {
                name: 'click_element',
                description: 'Click on an element identified by its ID',
                schema: z.object({ elementId: z.number() }),
                execute: (params: { elementId: number }) => {
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
                execute: (params: { elementId: number, text: string, submit?: boolean }) => {
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
                execute: (params: { direction: 'up' | 'down' }) => {
                    return this.playwright.scroll(params.direction)
                        .map(() => ({ success: true, message: `Scrolled ${params.direction}` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'navigate_to',
                description: 'Navigate to a URL',
                schema: z.object({ url: z.string() }),
                execute: (params: { url: string }) => {
                    return this.playwright.navigateTo(params.url as any)
                        .map(() => ({ success: true, message: `Navigated to ${params.url}` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            },
            {
                name: 'wait',
                description: 'Wait for a specified duration in milliseconds',
                schema: z.object({ durationMs: z.number() }),
                execute: (params: { durationMs: number }) => {
                    return this.playwright.wait(params.durationMs)
                        .map(() => ({ success: true, message: `Waited ${params.durationMs}ms` } as ActionResult))
                        .mapErr(err => new Error(err.message));
                }
            }
        ];
    }
}
