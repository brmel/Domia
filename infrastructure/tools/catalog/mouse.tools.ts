import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import { unwrapResult } from '../toolResult';

const pointParams = z.object({
    x: z.number().describe('Viewport X coordinate in pixels.'),
    y: z.number().describe('Viewport Y coordinate in pixels.'),
});

const point = (args: Record<string, unknown>): [number, number] => [args['x'] as number, args['y'] as number];

export function createMouseTools(automation: IAppAutomation): ToolSpec[] {
    return ([
        {
            name: 'mouse_move',
            description: 'Move the mouse pointer to absolute viewport coordinates without clicking. Use for hover effects, tooltips, dropdown previews, or positioning before another mouse action. Returns { status: "success" } on success or { status: "error", error: string } on failure.',
            actionType: ActionType.MOUSE_MOVE,
            parameters: pointParams,
            execute: async (args) => unwrapResult(await automation.mouseMove(...point(args))),
        },
        {
            name: 'mouse_click_left',
            description: 'Left-click at absolute viewport pixel coordinates. Use when ref-based click is unavailable — e.g. canvas elements, SVG graphics, maps, or custom widgets without ARIA handles. Returns { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.MOUSE_CLICK_LEFT,
            parameters: pointParams,
            execute: async (args) => unwrapResult(await automation.mouseClick(...point(args), 'left')),
        },
        {
            name: 'mouse_click_right',
            description: 'Right-click (context menu) at absolute viewport pixel coordinates. Use to open application context menus. Returns { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.MOUSE_CLICK_RIGHT,
            parameters: pointParams,
            execute: async (args) => unwrapResult(await automation.mouseClick(...point(args), 'right')),
        },
        {
            name: 'mouse_double_click',
            description: 'Double-click at absolute viewport pixel coordinates. Typically used to select a word of text, activate an editable field, or trigger double-click handlers. Returns { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.MOUSE_DOUBLE_CLICK,
            parameters: pointParams,
            execute: async (args) => unwrapResult(await automation.mouseDoubleClick(...point(args))),
        },
        {
            name: 'mouse_drag',
            description: 'Click-and-drag from source to target coordinates. Use for sliders, drag-and-drop reordering, resizing handles, drawing on canvas, or range selections. Returns { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.MOUSE_DRAG,
            parameters: z.object({
                fromX: z.number().describe('Source X coordinate in viewport pixels.'),
                fromY: z.number().describe('Source Y coordinate in viewport pixels.'),
                toX: z.number().describe('Destination X coordinate in viewport pixels.'),
                toY: z.number().describe('Destination Y coordinate in viewport pixels.'),
                steps: z.number().int().min(1).max(100).optional().describe('Intermediate move steps. More steps = smoother drag. Default: 10.'),
            }),
            execute: async (args) => unwrapResult(
                await automation.mouseDrag(
                    args['fromX'] as number, args['fromY'] as number,
                    args['toX'] as number, args['toY'] as number,
                    args['steps'] as number | undefined,
                ),
            ),
        },
        {
            name: 'mouse_scroll',
            description: 'Dispatch a mouse wheel event at the current cursor position. Unlike scroll (page-level), this targets the element under the cursor — useful for scrollable containers, maps, or zoom controls. Positive deltaY = scroll down, negative = up. Returns { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.MOUSE_SCROLL,
            parameters: z.object({
                deltaX: z.number().optional().describe('Horizontal scroll delta in pixels. Positive = right. Default 0.'),
                deltaY: z.number().describe('Vertical scroll delta in pixels. Positive = down, negative = up.'),
            }),
            execute: async (args) => unwrapResult(
                await automation.mouseScroll((args['deltaX'] as number) ?? 0, args['deltaY'] as number),
            ),
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'mouse' as const, requires: { dom: true } }));
}
