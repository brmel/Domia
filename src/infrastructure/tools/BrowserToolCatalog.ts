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
        capture: z.boolean().optional().describe('Set to false to skip page capture after this action (default: true).'),
        captureDelayMs: z.number().int().nonnegative().optional().describe('Milliseconds to wait before capturing page state after the action (default: 0).'),
    };

    return [
        {
            name: 'click',
            description: 'Click an interactive element by its numeric elementId from the latest DOM snapshot.',
            actionType: ActionType.CLICK,
            parameters: z.object({ elementId: z.number().int().min(0), ...captureParams }),
            execute: async ({ elementId, capture, captureDelayMs }: { elementId: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.click(ElementIdFactory.unsafe(elementId));
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'type',
            description: 'Type text into an input-like element by elementId. Set submit=true to press Enter after typing.',
            actionType: ActionType.TYPE,
            parameters: z.object({
                elementId: z.number().int().min(0),
                text: z.string(),
                submit: z.boolean().optional(),
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
            description: 'Press a keyboard key (e.g. Enter, Tab, Escape).',
            actionType: ActionType.PRESS_KEY,
            parameters: z.object({ key: z.string(), ...captureParams }),
            execute: async ({ key, capture, captureDelayMs }: { key: string; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.pressKey(key);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'scroll',
            description: 'Scroll the current view up or down to reveal additional content.',
            actionType: ActionType.SCROLL,
            parameters: z.object({ direction: z.enum(['up', 'down']), ...captureParams }),
            execute: async ({ direction, capture, captureDelayMs }: { direction: 'up' | 'down'; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.scroll(direction);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_move',
            description: 'Move mouse cursor to viewport coordinates (x, y).',
            actionType: ActionType.MOUSE_MOVE,
            parameters: z.object({ x: z.number(), y: z.number(), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseMove(x, y);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_click_left',
            description: 'Left-click at viewport coordinates (x, y).',
            actionType: ActionType.MOUSE_CLICK_LEFT,
            parameters: z.object({ x: z.number(), y: z.number(), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseClick(x, y, 'left');
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_click_right',
            description: 'Right-click at viewport coordinates (x, y).',
            actionType: ActionType.MOUSE_CLICK_RIGHT,
            parameters: z.object({ x: z.number(), y: z.number(), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseClick(x, y, 'right');
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_double_click',
            description: 'Double-click at viewport coordinates (x, y).',
            actionType: ActionType.MOUSE_DOUBLE_CLICK,
            parameters: z.object({ x: z.number(), y: z.number(), ...captureParams }),
            execute: async ({ x, y, capture, captureDelayMs }: { x: number; y: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseDoubleClick(x, y);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'mouse_drag',
            description: 'Drag mouse from source coordinates to target coordinates.',
            actionType: ActionType.MOUSE_DRAG,
            parameters: z.object({
                fromX: z.number(),
                fromY: z.number(),
                toX: z.number(),
                toY: z.number(),
                steps: z.number().int().min(1).max(100).optional(),
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
            description: 'Scroll at current cursor position using wheel deltas.',
            actionType: ActionType.MOUSE_SCROLL,
            parameters: z.object({ deltaX: z.number().optional(), deltaY: z.number(), ...captureParams }),
            execute: async ({ deltaX, deltaY, capture, captureDelayMs }: { deltaX?: number; deltaY: number; capture?: boolean; captureDelayMs?: number }) => {
                const result = await browser.mouseScroll(deltaX ?? 0, deltaY);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'wait',
            description: 'Wait for UI/network settling before the next action. Prefer short waits.',
            actionType: ActionType.WAIT,
            parameters: z.object({ durationMs: z.number().optional(), ...captureParams }),
            execute: async ({ durationMs, capture, captureDelayMs }: { durationMs?: number; capture?: boolean; captureDelayMs?: number }) => {
                const ms = typeof durationMs === 'number' ? durationMs : 1000;
                const result = await browser.wait(ms);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return maybeCap({ capture, captureDelayMs });
            },
        },
        {
            name: 'extract',
            description: 'Extract text/content from an element by elementId for verification purposes.',
            actionType: ActionType.EXTRACT,
            parameters: z.object({ elementId: z.number().int().min(0) }),
            execute: async ({ elementId }: { elementId: number }) => {
                const result = await browser.extractText(ElementIdFactory.unsafe(elementId));
                if (result.isErr()) return { status: 'error', error: result.error.message };
                const text = result.value.replace(/\s+/g, ' ').trim().slice(0, 400);
                return { status: 'success', extractedText: text || '(empty)' };
            },
        },
        {
            name: 'navigate',
            description: 'Navigate to an absolute URL when changing page is required.',
            actionType: ActionType.NAVIGATE,
            parameters: z.object({ url: z.string(), ...captureParams }),
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
            description: 'Capture the current page state (DOM snapshot + optional screenshot) without performing any browser action. Use this to see the page after a fire-and-forget action, or after waiting for an animation/network request to complete.',
            actionType: ActionType.OBSERVE,
            parameters: z.object({
                delayMs: z.number().int().nonnegative().optional().describe('Milliseconds to wait before capturing (default: 0).'),
                vision: z.boolean().optional().describe('Override session-level vision. Set true to force a screenshot, false to skip it.'),
            }),
            execute: async ({ delayMs, vision: visionOverride }: { delayMs?: number; vision?: boolean }) => {
                return capturePostActionState(browser, perception, vision, delayMs ?? 0, visionOverride, onCapture);
            },
        },
        {
            name: 'pass',
            description: 'Mark the current task as completed. Call this ONLY when you have gathered concrete evidence that the goal is satisfied.',
            actionType: ActionType.PASS,
            parameters: z.object({ summary: z.string().optional() }),
            execute: ({ summary }: { summary?: string }) => {
                return { status: 'TASK_COMPLETED', summary: summary ?? 'Task completed successfully' };
            },
        },
        {
            name: 'fail',
            description: 'Mark the current task as failed with a concrete reason after re-checking and trying alternatives.',
            actionType: ActionType.FAIL,
            parameters: z.object({ reason: z.string() }),
            execute: ({ reason }: { reason: string }) => {
                return { status: 'TASK_FAILED', reason };
            },
        },
    ];
}
