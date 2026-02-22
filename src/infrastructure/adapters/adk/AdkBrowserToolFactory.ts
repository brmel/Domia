import { FunctionTool } from '@google/adk';
import type { ToolOptions, ToolInputParameters } from '@google/adk';
import { z } from 'zod';
import type { IBrowserAutomation, IPerceptionPipeline } from '@domain/ports';
import { ElementIdFactory } from '@domain/value-objects';
import type { DOMElement } from '@domain/value-objects/DOMSnapshot';

// Helper to bypass Zod version mismatch between project (3.25/v4-compat) and ADK (4.x native).
// Both are functionally identical; only the private `_cached` field differs in TS declarations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tool(opts: { name: string; description: string; parameters: any; execute: any }): FunctionTool {
    return new FunctionTool(opts as ToolOptions<ToolInputParameters>);
}

/**
 * Formats a DOMElement list into a concise text representation for the LLM.
 */
export function formatElements(elements: readonly DOMElement[], limit = 50): string {
    return elements
        .slice(0, limit)
        .map((el) => {
            const attrs = Object.entries(el.attributes)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
            const bbox = el.boundingBox
                ? `[x:${Math.round(el.boundingBox.x)},y:${Math.round(el.boundingBox.y)},w:${Math.round(el.boundingBox.width)},h:${Math.round(el.boundingBox.height)}]`
                : '';
            return `[${el.id}] <${el.tag} ${attrs}>${el.text.slice(0, 50)}</${el.tag}> ${bbox}`;
        })
        .join('\n');
}

/**
 * Captures page state after a browser action.
 * When vision is enabled, also captures a screenshot for multimodal reasoning.
 */
async function capturePostActionState(
    browser: IBrowserAutomation,
    perception: IPerceptionPipeline,
    vision: boolean,
): Promise<Record<string, unknown>> {
    await browser.waitForDOMStable();
    const frameResult = await perception.capture(browser, { dom: true, aria: true, vision });

    if (frameResult.isErr()) {
        return { status: 'error', error: `Perception capture failed: ${frameResult.error.message}` };
    }

    const frame = frameResult.value;
    const viewport = await browser.getViewportSize();

    const result: Record<string, unknown> = {
        status: 'success',
        currentUrl: frame.metadata.url,
        pageTitle: frame.metadata.title,
        viewport: `${viewport.width}x${viewport.height}`,
        elementCount: frame.semantic.dom.elements.length,
        elements: formatElements(frame.semantic.dom.elements),
    };

    // When vision is enabled, include the screenshot as base64 for the LLM
    if (vision && frame.vision.primaryScreenshot) {
        result['screenshot'] = {
            base64: frame.vision.primaryScreenshot.toString('base64'),
            mimeType: frame.vision.mimeType,
        };
    }

    return result;
}

export interface AdkToolDependencies {
    readonly browser: IBrowserAutomation;
    readonly perception: IPerceptionPipeline;
    /** Whether to capture screenshots in tool responses for multimodal reasoning. */
    readonly vision: boolean;
}

/**
 * Creates ADK FunctionTool instances for all browser actions.
 * Each tool executes the browser action, captures the new DOM state,
 * and returns it to the LLM agent for multi-turn reasoning.
 */
export function createAdkBrowserTools(deps: AdkToolDependencies): FunctionTool[] {
    const { browser, perception, vision } = deps;

    const capture = () => capturePostActionState(browser, perception, vision);

    const click = tool({
        name: 'click',
        description: 'Click an interactive element by its numeric elementId from the latest DOM snapshot.',
        parameters: z.object({ elementId: z.number().int().min(0) }),
        execute: async ({ elementId }: { elementId: number }) => {
            const result = await browser.click(ElementIdFactory.unsafe(elementId));
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const typeText = tool({
        name: 'type',
        description: 'Type text into an input-like element by elementId. Set submit=true to press Enter after typing.',
        parameters: z.object({
            elementId: z.number().int().min(0),
            text: z.string(),
            submit: z.boolean().optional(),
        }),
        execute: async ({ elementId, text, submit }: { elementId: number; text: string; submit?: boolean }) => {
            const result = await browser.type(ElementIdFactory.unsafe(elementId), text);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            if (submit) {
                const enterResult = await browser.pressKey('Enter');
                if (enterResult.isErr()) {
                    return { status: 'error', error: enterResult.error.message };
                }
            }
            return capture();
        },
    });

    const pressKey = tool({
        name: 'pressKey',
        description: 'Press a keyboard key (e.g. Enter, Tab, Escape).',
        parameters: z.object({ key: z.string() }),
        execute: async ({ key }: { key: string }) => {
            const result = await browser.pressKey(key);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const scroll = tool({
        name: 'scroll',
        description: 'Scroll the current view up or down to reveal additional content.',
        parameters: z.object({ direction: z.enum(['up', 'down']) }),
        execute: async ({ direction }: { direction: 'up' | 'down' }) => {
            const result = await browser.scroll(direction);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const mouseMove = tool({
        name: 'mouse_move',
        description: 'Move mouse cursor to viewport coordinates (x, y).',
        parameters: z.object({ x: z.number(), y: z.number() }),
        execute: async ({ x, y }: { x: number; y: number }) => {
            const result = await browser.mouseMove(x, y);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const mouseClickLeft = tool({
        name: 'mouse_click_left',
        description: 'Left-click at viewport coordinates (x, y).',
        parameters: z.object({ x: z.number(), y: z.number() }),
        execute: async ({ x, y }: { x: number; y: number }) => {
            const result = await browser.mouseClick(x, y, 'left');
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const mouseClickRight = tool({
        name: 'mouse_click_right',
        description: 'Right-click at viewport coordinates (x, y).',
        parameters: z.object({ x: z.number(), y: z.number() }),
        execute: async ({ x, y }: { x: number; y: number }) => {
            const result = await browser.mouseClick(x, y, 'right');
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const mouseDoubleClick = tool({
        name: 'mouse_double_click',
        description: 'Double-click at viewport coordinates (x, y).',
        parameters: z.object({ x: z.number(), y: z.number() }),
        execute: async ({ x, y }: { x: number; y: number }) => {
            const result = await browser.mouseDoubleClick(x, y);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const mouseDrag = tool({
        name: 'mouse_drag',
        description: 'Drag mouse from source coordinates to target coordinates.',
        parameters: z.object({
            fromX: z.number(),
            fromY: z.number(),
            toX: z.number(),
            toY: z.number(),
            steps: z.number().int().min(1).max(100).optional(),
        }),
        execute: async ({ fromX, fromY, toX, toY, steps }: { fromX: number; fromY: number; toX: number; toY: number; steps?: number }) => {
            const result = await browser.mouseDrag(fromX, fromY, toX, toY, steps);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const mouseScroll = tool({
        name: 'mouse_scroll',
        description: 'Scroll at current cursor position using wheel deltas.',
        parameters: z.object({ deltaX: z.number().optional(), deltaY: z.number() }),
        execute: async ({ deltaX, deltaY }: { deltaX?: number; deltaY: number }) => {
            const result = await browser.mouseScroll(deltaX ?? 0, deltaY);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const wait = tool({
        name: 'wait',
        description: 'Wait for UI/network settling before the next action. Prefer short waits.',
        parameters: z.object({ durationMs: z.number().optional() }),
        execute: async ({ durationMs }: { durationMs?: number }) => {
            const ms = typeof durationMs === 'number' ? durationMs : 1000;
            const result = await browser.wait(ms);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const extract = tool({
        name: 'extract',
        description: 'Extract text/content from an element by elementId for verification purposes.',
        parameters: z.object({ elementId: z.number().int().min(0) }),
        execute: async ({ elementId }: { elementId: number }) => {
            const result = await browser.extractText(ElementIdFactory.unsafe(elementId));
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            const text = result.value.replace(/\s+/g, ' ').trim().slice(0, 400);
            return {
                status: 'success',
                extractedText: text || '(empty)',
            };
        },
    });

    const navigate = tool({
        name: 'navigate',
        description: 'Navigate to an absolute URL when changing page is required.',
        parameters: z.object({ url: z.string() }),
        execute: async ({ url }: { url: string }) => {
            const urlVO = (await import('@domain/value-objects')).UrlFactory.create(url);
            if (urlVO.isErr()) {
                return { status: 'error', error: `Invalid URL: ${urlVO.error.message}` };
            }
            const result = await browser.navigateTo(urlVO.value);
            if (result.isErr()) {
                return { status: 'error', error: result.error.message };
            }
            return capture();
        },
    });

    const pass = tool({
        name: 'pass',
        description: 'Mark the current task as completed. Call this ONLY when you have gathered concrete evidence that the goal is satisfied.',
        parameters: z.object({ summary: z.string().optional() }),
        execute: ({ summary }: { summary?: string }) => {
            return { status: 'TASK_COMPLETED', summary: summary ?? 'Task completed successfully' };
        },
    });

    const fail = tool({
        name: 'fail',
        description: 'Mark the current task as failed with a concrete reason after re-checking and trying alternatives.',
        parameters: z.object({ reason: z.string() }),
        execute: ({ reason }: { reason: string }) => {
            return { status: 'TASK_FAILED', reason };
        },
    });

    return [
        click, typeText, pressKey, scroll,
        mouseMove, mouseClickLeft, mouseClickRight, mouseDoubleClick,
        mouseDrag, mouseScroll,
        wait, extract, navigate,
        pass, fail,
    ];
}
