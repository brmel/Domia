import { z } from 'zod';
import { ActionType } from '@domain/enums/ActionType';

const baseWithThought = {
    thought: z.string().min(1)
};

const clickAction = z.object({
    type: z.literal(ActionType.CLICK),
    elementId: z.number().int().nonnegative(),
    elementDescriptor: z.string().optional(),
    ...baseWithThought
});

const typeAction = z.object({
    type: z.literal(ActionType.TYPE),
    elementId: z.number().int().nonnegative(),
    elementDescriptor: z.string().optional(),
    text: z.string(),
    submit: z.boolean().optional(),
    ...baseWithThought
});

const scrollAction = z.object({
    type: z.literal(ActionType.SCROLL),
    direction: z.enum(['up', 'down']),
    ...baseWithThought
});

const mouseMoveAction = z.object({
    type: z.literal(ActionType.MOUSE_MOVE),
    x: z.number(),
    y: z.number(),
    ...baseWithThought
});

const mouseClickLeftAction = z.object({
    type: z.literal(ActionType.MOUSE_CLICK_LEFT),
    x: z.number(),
    y: z.number(),
    ...baseWithThought
});

const mouseClickRightAction = z.object({
    type: z.literal(ActionType.MOUSE_CLICK_RIGHT),
    x: z.number(),
    y: z.number(),
    ...baseWithThought
});

const mouseDoubleClickAction = z.object({
    type: z.literal(ActionType.MOUSE_DOUBLE_CLICK),
    x: z.number(),
    y: z.number(),
    ...baseWithThought
});

const mouseDragAction = z.object({
    type: z.literal(ActionType.MOUSE_DRAG),
    fromX: z.number(),
    fromY: z.number(),
    toX: z.number(),
    toY: z.number(),
    steps: z.number().int().positive().optional(),
    ...baseWithThought
});

const mouseScrollAction = z.object({
    type: z.literal(ActionType.MOUSE_SCROLL),
    deltaX: z.number(),
    deltaY: z.number(),
    ...baseWithThought
});

const waitAction = z.object({
    type: z.literal(ActionType.WAIT),
    durationMs: z.number().int().positive(),
    ...baseWithThought
});

const pressKeyAction = z.object({
    type: z.literal(ActionType.PRESS_KEY),
    key: z.string().min(1),
    ...baseWithThought
});

const extractAction = z.object({
    type: z.literal(ActionType.EXTRACT),
    elementId: z.number().int().nonnegative(),
    elementDescriptor: z.string().optional(),
    ...baseWithThought
});

const navigateAction = z.object({
    type: z.literal(ActionType.NAVIGATE),
    url: z.string().url(),
    ...baseWithThought
});

const passAction = z.object({
    type: z.literal(ActionType.PASS),
    summary: z.string().min(1),
    thought: z.string().optional()
});

const failAction = z.object({
    type: z.literal(ActionType.FAIL),
    reason: z.string().min(1),
    thought: z.string().optional()
});

export const AgentActionSchema = z.discriminatedUnion('type', [
    clickAction,
    typeAction,
    scrollAction,
    mouseMoveAction,
    mouseClickLeftAction,
    mouseClickRightAction,
    mouseDoubleClickAction,
    mouseDragAction,
    mouseScrollAction,
    waitAction,
    pressKeyAction,
    extractAction,
    navigateAction,
    passAction,
    failAction
]);

export type AgentActionInput = z.infer<typeof AgentActionSchema>;
