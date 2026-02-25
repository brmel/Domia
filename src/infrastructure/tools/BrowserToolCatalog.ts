/**
 * Framework-agnostic browser tool definitions.
 *
 * This module defines every tool the AI agent can call (name, description,
 * Zod parameter schema, execute function) without coupling to any specific
 * agent framework (ADK, OpenAI, LangChain, …).
 *
 * Provider-specific adapters (e.g. AdkBrowserToolFactory) convert these
 * specs into the format required by their framework.
 */

import { z } from 'zod';
import type { IBrowserAutomation, IPerceptionPipeline } from '@domain/ports';
import { ElementIdFactory } from '@domain/value-objects';
import type { DOMElement } from '@domain/value-objects/DOMSnapshot';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { ActionType } from '@domain/enums/ActionType';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A framework-agnostic tool specification.
 *
 * `parameters` is a Zod schema so any adapter can introspect, convert to
 * JSON-Schema, or pass directly to frameworks that accept Zod (e.g. ADK).
 */
export interface BrowserToolSpec {
    readonly name: string;
    readonly description: string;
    /** The ActionType this tool maps to (used by runners to emit domain events). */
    readonly actionType: ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    /**
     * Execute receives the Zod-validated args matching `parameters`.
     * Typed as the Zod output shape — each tool implementation destructures
     * the concrete fields guaranteed by its schema at runtime.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly execute: (...args: any[]) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface BrowserToolDependencies {
    readonly browser: IBrowserAutomation;
    readonly perception: IPerceptionPipeline;
    /** Whether to capture screenshots in tool responses for multimodal reasoning. */
    readonly vision: boolean;
    /** Optional callback invoked after every perception capture, enabling the runner to persist the frame. */
    readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 *
 * @param delayMs  If > 0, waits this many ms before capturing (e.g. for animations / network).
 * @param visionOverride  If provided, overrides the session-level vision setting for this capture.
 */
async function capturePostActionState(
    browser: IBrowserAutomation,
    perception: IPerceptionPipeline,
    vision: boolean,
    delayMs = 0,
    visionOverride?: boolean,
    onCapture?: (frame: PerceptionFrame) => void | Promise<void>,
): Promise<Record<string, unknown>> {
    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await browser.waitForDOMStable();

    const useVision = visionOverride ?? vision;
    const frameResult = await perception.capture(browser, { dom: true, aria: true, vision: useVision });

    if (frameResult.isErr()) {
        return { status: 'error', error: `Perception capture failed: ${frameResult.error.message}` };
    }

    const frame = frameResult.value;

    // Notify the runner so it can persist the frame to disk for the inspector.
    if (onCapture) {
        try { await onCapture(frame); } catch { /* persistence failure must not break the agent loop */ }
    }

    const viewport = await browser.getViewportSize();

    const result: Record<string, unknown> = {
        status: 'success',
        currentUrl: frame.metadata.url,
        pageTitle: frame.metadata.title,
        viewport: `${viewport.width}x${viewport.height}`,
        elementCount: frame.semantic.dom.elements.length,
        elements: formatElements(frame.semantic.dom.elements),
    };

    if (useVision && frame.vision.primaryScreenshot) {
        result['screenshot'] = {
            base64: frame.vision.primaryScreenshot.toString('base64'),
            mimeType: frame.vision.mimeType,
        };
    }

    return result;
}

/** Minimal response when the agent skips capture. */
const CAPTURE_SKIPPED: Record<string, unknown> = { status: 'success', capture: 'skipped' };

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Creates the full set of framework-agnostic browser tool specs.
 *
 * Every action tool accepts two optional capture-control parameters:
 *   - `capture`        (boolean, default true)  — whether to run the perception pipeline after the action.
 *   - `captureDelayMs` (number,  default 0)     — milliseconds to wait before capturing (useful for animations/network).
 *
 * A standalone `observe` tool lets the agent capture page state without performing any action.
 */
export function createBrowserToolCatalog(deps: BrowserToolDependencies): BrowserToolSpec[] {
    const { browser, perception, vision, onCapture } = deps;

    /** Conditionally capture based on agent's choice. */
    const maybeCap = (opts: { capture?: boolean | undefined; captureDelayMs?: number | undefined }) =>
        opts.capture === false
            ? Promise.resolve(CAPTURE_SKIPPED)
            : capturePostActionState(browser, perception, vision, opts.captureDelayMs ?? 0, undefined, onCapture);

    /** Common optional params added to every action tool schema. */
    const captureParams = {
        capture: z.boolean().optional().describe('If false, skip post-action page capture. Default true.'),
        captureDelayMs: z.number().int().nonnegative().optional().describe('Ms to wait before capturing (animations/network). Default 0.'),
    };

    return [
        {
            name: 'click',
            description: 'Click an element by its elementId from the DOM snapshot. Handles navigation, toggling, opening menus, etc. Returns updated DOM elements and optional screenshot.',
            actionType: ActionType.CLICK,
            parameters: z.object({ elementId: z.number().int().min(0).describe('Numeric ID from the DOM snapshot (e.g. the [42] in "[42] <button>Submit</button>").'), ...captureParams }),
            execute: async ({ elementId, capture, captureDelayMs }: { elementId: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.click(ElementIdFactory.unsafe(elementId));
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'type',
            description: 'Type text into an input, textarea, or contenteditable element. Replaces any existing value. Set submit=true to press Enter after typing (form submission). Returns updated page state.',
            actionType: ActionType.TYPE,
            parameters: z.object({
                elementId: z.number().int().min(0).describe('Numeric ID of the target input element from the DOM snapshot.'),
                text: z.string().describe('Text to type into the element. Replaces current content.'),
                submit: z.boolean().optional().describe('If true, press Enter after typing to submit the form. Default false.'),
                ...captureParams,
            }),
            execute: async ({ elementId, text, submit, capture, captureDelayMs }: { elementId: number; text: string; submit?: boolean; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.type(ElementIdFactory.unsafe(elementId), text);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                if (submit) {
                    const enterResult = await browser.pressKey('Enter');
                    if (enterResult.isErr()) return { status: 'error', error: enterResult.error.message };
                }
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'pressKey',
            description: 'Dispatch a single key press. Supports named keys (Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Space, Home, End, PageUp, PageDown) and single characters. Returns updated page state.',
            actionType: ActionType.PRESS_KEY,
            parameters: z.object({ key: z.string().describe('Key to press — a Playwright key name or single character.'), ...captureParams }),
            execute: async ({ key, capture, captureDelayMs }: { key: string; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.pressKey(key);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'scroll',
            description: 'Scroll the viewport by one page-height in the given direction. Use to reveal off-screen content, lazy-loaded sections, or infinite-scroll items. Returns the newly visible DOM elements.',
            actionType: ActionType.SCROLL,
            parameters: z.object({ direction: z.enum(['up', 'down']).describe('Scroll direction: "up" or "down".'), ...captureParams }),
            execute: async ({ direction, capture, captureDelayMs }: { direction: 'up' | 'down'; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.scroll(direction);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_move',
            description: 'Move the mouse pointer to absolute viewport coordinates without clicking. Use for hover effects, tooltips, dropdown previews, or positioning before another mouse action. Returns updated page state reflecting hover changes.',
            actionType: ActionType.MOUSE_MOVE,
            parameters: z.object({ x: z.number().describe('Viewport X coordinate in pixels.'), y: z.number().describe('Viewport Y coordinate in pixels.'), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseMove(x, y);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_click_left',
            description: 'Left-click at absolute viewport pixel coordinates. Use when elementId-based click is unavailable — e.g. canvas elements, SVG graphics, maps, or custom widgets without DOM handles. Returns updated page state.',
            actionType: ActionType.MOUSE_CLICK_LEFT,
            parameters: z.object({ x: z.number().describe('Viewport X coordinate in pixels.'), y: z.number().describe('Viewport Y coordinate in pixels.'), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseClick(x, y, 'left');
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_click_right',
            description: 'Right-click (context menu) at absolute viewport pixel coordinates. Use to open browser or application context menus. Returns updated page state.',
            actionType: ActionType.MOUSE_CLICK_RIGHT,
            parameters: z.object({ x: z.number().describe('Viewport X coordinate in pixels.'), y: z.number().describe('Viewport Y coordinate in pixels.'), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseClick(x, y, 'right');
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_double_click',
            description: 'Double-click at absolute viewport pixel coordinates. Typically used to select a word of text, activate an editable field, or trigger double-click handlers. Returns updated page state.',
            actionType: ActionType.MOUSE_DOUBLE_CLICK,
            parameters: z.object({ x: z.number().describe('Viewport X coordinate in pixels.'), y: z.number().describe('Viewport Y coordinate in pixels.'), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseDoubleClick(x, y);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_drag',
            description: 'Click-and-drag from source to target coordinates. Use for sliders, drag-and-drop reordering, resizing handles, drawing on canvas, or range selections. Returns updated page state.',
            actionType: ActionType.MOUSE_DRAG,
            parameters: z.object({
                fromX: z.number().describe('Source X coordinate in viewport pixels.'),
                fromY: z.number().describe('Source Y coordinate in viewport pixels.'),
                toX: z.number().describe('Destination X coordinate in viewport pixels.'),
                toY: z.number().describe('Destination Y coordinate in viewport pixels.'),
                steps: z.number().int().min(1).max(100).optional().describe('Intermediate move steps between source and target. More steps = smoother drag. Default: 10.'),
                ...captureParams,
            }),
            execute: async ({ fromX, fromY, toX, toY, steps, capture, captureDelayMs }: { fromX: number; fromY: number; toX: number; toY: number; steps?: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseDrag(fromX, fromY, toX, toY, steps);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_scroll',
            description: 'Dispatch a mouse wheel event at the current cursor position. Unlike scroll (page-level), this targets the element under the cursor — useful for scrollable containers, maps, or zoom controls. Positive deltaY = scroll down, negative = scroll up.',
            actionType: ActionType.MOUSE_SCROLL,
            parameters: z.object({ deltaX: z.number().optional().describe('Horizontal scroll delta in pixels. Positive = right. Default 0.'), deltaY: z.number().describe('Vertical scroll delta in pixels. Positive = down, negative = up.'), ...captureParams }),
            execute: async ({ deltaX, deltaY, capture, captureDelayMs }: { deltaX?: number; deltaY: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseScroll(deltaX ?? 0, deltaY);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'wait',
            description: 'Pause execution for a specified duration, then capture page state. Use to let animations, transitions, AJAX calls, or debounced UI updates complete. Prefer short waits (500-2000ms). Returns refreshed DOM snapshot.',
            actionType: ActionType.WAIT,
            parameters: z.object({ durationMs: z.number().optional().describe('Milliseconds to pause. Default 1000.'), ...captureParams }),
            execute: async ({ durationMs, capture, captureDelayMs }: { durationMs?: number; capture?: boolean; captureDelayMs?: number }) => {
                const ms = typeof durationMs === 'number' ? durationMs : 1000;
                const result = await browser.wait(ms);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'extract',
            description: 'Extract the visible text content of an element for assertion or verification. Returns up to 400 characters of whitespace-normalized text. No page capture is performed — use observe afterwards if you need a fresh DOM snapshot.',
            actionType: ActionType.EXTRACT,
            parameters: z.object({ elementId: z.number().int().min(0).describe('Numeric ID of the element to extract text from.') }),
            execute: async ({ elementId }: { elementId: number }) => {
                const result = await browser.extractText(ElementIdFactory.unsafe(elementId));
                if (result.isErr()) return { status: 'error', error: result.error.message };
                const text = result.value.replace(/\s+/g, ' ').trim().slice(0, 400);
                return { status: 'success', extractedText: text || '(empty)' };
            },
        },
        {
            name: 'navigate',
            description: 'Navigate the browser to an absolute URL. Waits for the page to load then captures DOM and optional screenshot. Use when you need to open a different page, reload, or jump to a deep link.',
            actionType: ActionType.NAVIGATE,
            parameters: z.object({ url: z.string().describe('Absolute URL to navigate to (must include protocol, e.g. https://example.com).'), ...captureParams }),
            execute: async ({ url, capture, captureDelayMs }: { url: string; capture?: boolean; captureDelayMs?: number }) => {
                const urlVO = (await import('@domain/value-objects')).UrlFactory.create(url);
                if (urlVO.isErr()) return { status: 'error', error: `Invalid URL: ${urlVO.error.message}` };
                const result = await browser.navigateTo(urlVO.value);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'observe',
            description: 'Capture current page state (DOM elements + optional screenshot) without any browser action. Use to refresh your view after a fire-and-forget action, verify visual changes, or re-examine the page after waiting. Returns the same page data as action tools but with no side effects.',
            actionType: ActionType.OBSERVE,
            parameters: z.object({
                delayMs: z.number().int().nonnegative().optional().describe('Ms to wait before capturing. Use for animations/transitions. Default 0.'),
                vision: z.boolean().optional().describe('Override session-level vision setting. True = force screenshot, false = skip it.'),
            }),
            execute: async ({ delayMs, vision: visionOverride }: { delayMs?: number; vision?: boolean }) => {
                return capturePostActionState(browser, perception, vision, delayMs ?? 0, visionOverride, onCapture);
            },
        },
        {
            name: 'pass',
            description: 'Declare the task PASSED. Call ONLY when you have concrete evidence (via extract or observe) that the goal is fully satisfied. Terminates the agent loop. No page capture is performed.',
            actionType: ActionType.PASS,
            parameters: z.object({ summary: z.string().optional().describe('Brief description of what was verified and how the goal was met.') }),
            execute: ({ summary }: { summary?: string }) => {
                return { status: 'TASK_COMPLETED', summary: summary ?? 'Task completed successfully' };
            },
        },
        {
            name: 'fail',
            description: 'Declare the task FAILED. Call ONLY after exhausting alternatives and retries. Terminates the agent loop. No page capture is performed.',
            actionType: ActionType.FAIL,
            parameters: z.object({ reason: z.string().describe('Specific explanation of what was attempted and why it could not succeed.') }),
            execute: ({ reason }: { reason: string }) => {
                return { status: 'TASK_FAILED', reason };
            },
        },
    ];
}
