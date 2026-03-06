import { z } from 'zod';
import type { IStructuredAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';
import { WEB_ELECTRON_PLATFORMS, unwrapResult, toolError, toolSuccess } from '../toolResult';

export function createInteractionTools(automation: IStructuredAutomation): ToolSpec[] {
    return ([
        {
            name: 'click',
            description: 'Click an element by its ref from the ARIA snapshot. Input: { ref: string }. Output: { status: "success", navigatedUrl: string } or { status: "error", error: string }.',
            actionType: ActionType.CLICK,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                ref: z.string().describe('Element ref from the ARIA snapshot (e.g. "e3").'),
            }),
            execute: async (args) => {
                const result = await automation.click(args['ref'] as string);
                if (result.isErr()) return toolError(result.error.message);
                return toolSuccess({ navigatedUrl: automation.getCurrentUrl() ?? '' });
            },
        },
        {
            name: 'type',
            description: 'Type text into an input, textarea, or contenteditable element. Replaces any existing value. Set submit=true to press Enter after typing. Input: { ref: string, text: string, submit?: boolean }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.TYPE,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                ref: z.string().describe('Element ref of the target input from the ARIA snapshot.'),
                text: z.string().describe('Text to type into the element. Replaces current content.'),
                submit: z.boolean().optional().describe('If true, press Enter after typing to submit the form. Default false.'),
            }),
            execute: async (args) => {
                const result = await automation.type(args['ref'] as string, args['text'] as string);
                if (result.isErr()) return toolError(result.error.message);
                if (args['submit']) {
                    const enterResult = await automation.pressKey('Enter');
                    if (enterResult.isErr()) return toolError(enterResult.error.message);
                }
                return toolSuccess();
            },
        },
        {
            name: 'hover',
            description: 'Hover over an element to trigger tooltips, dropdown menus, or hover states. Input: { ref: string }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.HOVER,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                ref: z.string().describe('Element ref from the ARIA snapshot.'),
            }),
            execute: async (args) => unwrapResult(await automation.hover(args['ref'] as string)),
        },
        {
            name: 'selectOption',
            description: 'Select one or more options in a <select> dropdown by their visible text or value. Input: { ref: string, values: string[] }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.SELECT_OPTION,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                ref: z.string().describe('Element ref of the <select> from the ARIA snapshot.'),
                values: z.array(z.string()).min(1).describe('Option values or labels to select.'),
            }),
            execute: async (args) => unwrapResult(
                await automation.selectOption(args['ref'] as string, args['values'] as string[]),
            ),
        },
        {
            name: 'dragTo',
            description: 'Drag an element and drop it onto another element. Input: { fromRef: string, toRef: string }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.DRAG_TO,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                fromRef: z.string().describe('Element ref to drag from the ARIA snapshot.'),
                toRef: z.string().describe('Element ref to drop onto from the ARIA snapshot.'),
            }),
            execute: async (args) => unwrapResult(
                await automation.dragTo(args['fromRef'] as string, args['toRef'] as string),
            ),
        },
        {
            name: 'pressKey',
            description: 'Dispatch a single key press. Supports named keys (Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Space, Home, End, PageUp, PageDown) and single characters. Input: { key: string }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.PRESS_KEY,
            parameters: z.object({
                key: z.string().describe('Key to press — a Playwright key name or single character.'),
            }),
            execute: async (args) => unwrapResult(await automation.pressKey(args['key'] as string)),
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'interaction' as const }));
}
