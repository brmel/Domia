import { z } from 'zod';
import type { IStructuredAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';
import type { PostActionCaptureMiddleware } from '../PostActionCaptureMiddleware';

export function createObservationTools(
    automation: IStructuredAutomation,
    captureMiddleware: PostActionCaptureMiddleware,
): ToolSpec[] {
    return [
        {
            name: 'observe',
            description: 'Capture current page state (ARIA snapshot with refs + optional screenshot) without any interaction. Use to refresh your view after an action. Input: { delayMs?: number (default 0), vision?: boolean }. Output: { status: "success", currentUrl, pageTitle, elementCount, elements } or { status: "error", error: string }.',
            actionType: ActionType.OBSERVE,
            parameters: z.object({
                delayMs: z.number().int().nonnegative().optional().describe('Ms to wait before capturing. Use for animations/transitions. Default 0.'),
                vision: z.boolean().optional().describe('Override session-level vision setting. True = force screenshot, false = skip it.'),
            }),
            execute: async (args) => captureMiddleware.capture(
                args['delayMs'] as number | undefined,
                args['vision'] as boolean | undefined,
            ),
        },
        {
            name: 'extract',
            description: 'Extract the visible text content of an element for assertion or verification. Returns up to 400 characters of whitespace-normalized text. Input: { ref: string }. Output: { status: "success", extractedText: string } or { status: "error", error: string }.',
            actionType: ActionType.EXTRACT,
            platforms: ['web', 'electron'] as const,
            parameters: z.object({
                ref: z.string().describe('Element ref from the ARIA snapshot (e.g. "e3").'),
            }),
            execute: async (args) => {
                const result = await automation.extractText(args['ref'] as string);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                const text = result.value.replace(/\s+/g, ' ').trim().slice(0, 400);
                return { status: 'success', extractedText: text || '(empty)' };
            },
        },
        {
            name: 'wait',
            description: 'Pause execution for a specified duration. Use to let animations, transitions, AJAX calls, or debounced UI updates complete. Input: { durationMs?: number (default 1000) }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.WAIT,
            parameters: z.object({
                durationMs: z.number().optional().describe('Milliseconds to pause. Default 1000.'),
            }),
            execute: async (args) => {
                const ms = typeof args['durationMs'] === 'number' ? (args['durationMs'] as number) : 1000;
                const result = await automation.wait(ms);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return { status: 'success' };
            },
        },
    ];
}
