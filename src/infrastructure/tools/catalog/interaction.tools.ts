import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { ElementIdFactory } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';

export function createInteractionTools(automation: IAppAutomation): ToolSpec[] {
    return [
        {
            name: 'click',
            description: 'Click an element by its elementId from the DOM snapshot. Handles navigation, toggling, opening menus, etc. Returns updated DOM elements and optional screenshot.',
            actionType: ActionType.CLICK,
            capturable: true,
            parameters: z.object({
                elementId: z.number().int().min(0).describe('Numeric ID from the DOM snapshot (e.g. the [42] in "[42] <button>Submit</button>").'),
            }),
            execute: async (args) => {
                const result = await automation.click(ElementIdFactory.unsafe(args['elementId'] as number));
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return { status: 'success' };
            },
        },
        {
            name: 'type',
            description: 'Type text into an input, textarea, or contenteditable element. Replaces any existing value. Set submit=true to press Enter after typing (form submission). Returns updated page state.',
            actionType: ActionType.TYPE,
            capturable: true,
            parameters: z.object({
                elementId: z.number().int().min(0).describe('Numeric ID of the target input element from the DOM snapshot.'),
                text: z.string().describe('Text to type into the element. Replaces current content.'),
                submit: z.boolean().optional().describe('If true, press Enter after typing to submit the form. Default false.'),
            }),
            execute: async (args) => {
                const result = await automation.type(ElementIdFactory.unsafe(args['elementId'] as number), args['text'] as string);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                if (args['submit']) {
                    const enterResult = await automation.pressKey('Enter');
                    if (enterResult.isErr()) return { status: 'error', error: enterResult.error.message };
                }
                return { status: 'success' };
            },
        },
        {
            name: 'pressKey',
            description: 'Dispatch a single key press. Supports named keys (Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Space, Home, End, PageUp, PageDown) and single characters. Returns updated page state.',
            actionType: ActionType.PRESS_KEY,
            capturable: true,
            parameters: z.object({
                key: z.string().describe('Key to press — a Playwright key name or single character.'),
            }),
            execute: async (args) => {
                const result = await automation.pressKey(args['key'] as string);
                if (result.isErr()) return { status: 'error', error: result.error.message };
                return { status: 'success' };
            },
        },
    ];
}
