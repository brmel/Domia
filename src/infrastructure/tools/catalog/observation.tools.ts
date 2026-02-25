import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { ElementIdFactory } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';
import type { PostActionCaptureMiddleware } from '../PostActionCaptureMiddleware';

export function createObservationTools(
    automation: IAppAutomation,
    captureMiddleware: PostActionCaptureMiddleware,
): ToolSpec[] {
    return [
        {
            name: 'observe',
            description: 'Capture current page state (DOM elements + optional screenshot) without any interaction. Use to refresh your view after a fire-and-forget action, verify visual changes, or re-examine the page after waiting.',
            actionType: ActionType.OBSERVE,
            capturable: false,
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
            description: 'Extract the visible text content of an element for assertion or verification. Returns up to 400 characters of whitespace-normalized text. No page capture — use observe afterwards if you need a fresh DOM snapshot.',
            actionType: ActionType.EXTRACT,
            capturable: false,
            parameters: z.object({
                elementId: z.number().int().min(0).describe('Numeric ID of the element to extract text from.'),
            }),
            execute: async (args) => {
                const result = await automation.extractText(ElementIdFactory.unsafe(args['elementId'] as number));
                if (result.isErr()) return { status: 'error', error: result.error.message };
                const text = result.value.replace(/\s+/g, ' ').trim().slice(0, 400);
                return { status: 'success', extractedText: text || '(empty)' };
            },
        },
        {
            name: 'wait',
            description: 'Pause execution for a specified duration, then capture page state. Use to let animations, transitions, AJAX calls, or debounced UI updates complete. Prefer short waits (500-2000ms).',
            actionType: ActionType.WAIT,
            capturable: true,
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
