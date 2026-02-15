import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ActionType } from '@domain/enums/ActionType';
import { ElementIdFactory } from '@domain/value-objects';
import type { AgentAction } from '@domain/value-objects';
import type { LLMEvaluationDecision } from '@domain/value-objects';
import type { LLMToolDescriptor, ToolCallDefinition } from '@domain/ports';
import type { ToolContext } from '@domain/tools/Tool';

export interface MappedToolRequest {
    readonly toolName: string;
    readonly input: Record<string, unknown>;
}

@injectable()
export class ActionToolMapper {
    getModelToolDefinitions(availableTools?: readonly LLMToolDescriptor[]): ToolCallDefinition[] {
        const allTools: ToolCallDefinition[] = [
            {
                name: ActionType.CLICK,
                description: 'Click an interactive element by its numeric elementId from the latest snapshot.',
                schema: z.object({ elementId: z.number() })
            },
            {
                name: ActionType.TYPE,
                description: 'Type text into an input-like element by elementId. Set submit=true to press Enter after typing.',
                schema: z.object({ elementId: z.number(), text: z.string(), submit: z.boolean().optional() })
            },
            {
                name: ActionType.PRESS_KEY,
                description: 'Press a keyboard key (for example Enter, Tab, Escape) when direct key interaction is needed.',
                schema: z.object({ key: z.string() })
            },
            {
                name: ActionType.SCROLL,
                description: 'Scroll the current view up or down to reveal additional content.',
                schema: z.object({ direction: z.enum(['up', 'down']) })
            },
            {
                name: ActionType.MOUSE_MOVE,
                description: 'Move mouse cursor to viewport coordinates (x, y).',
                schema: z.object({ x: z.number(), y: z.number() })
            },
            {
                name: ActionType.MOUSE_CLICK_LEFT,
                description: 'Left-click at viewport coordinates (x, y).',
                schema: z.object({ x: z.number(), y: z.number() })
            },
            {
                name: ActionType.MOUSE_CLICK_RIGHT,
                description: 'Right-click at viewport coordinates (x, y).',
                schema: z.object({ x: z.number(), y: z.number() })
            },
            {
                name: ActionType.MOUSE_DOUBLE_CLICK,
                description: 'Double-click at viewport coordinates (x, y).',
                schema: z.object({ x: z.number(), y: z.number() })
            },
            {
                name: ActionType.MOUSE_DRAG,
                description: 'Drag mouse from source coordinates to target coordinates.',
                schema: z.object({
                    fromX: z.number(),
                    fromY: z.number(),
                    toX: z.number(),
                    toY: z.number(),
                    steps: z.number().int().min(1).max(100).optional()
                })
            },
            {
                name: ActionType.MOUSE_SCROLL,
                description: 'Scroll at current cursor position using wheel deltas.',
                schema: z.object({ deltaX: z.number().optional(), deltaY: z.number() })
            },
            {
                name: ActionType.WAIT,
                description: 'Wait for UI/network settling before the next action. Prefer short waits.',
                schema: z.object({ durationMs: z.number().optional() })
            },
            {
                name: ActionType.EXTRACT,
                description: 'Extract text/content from an element by elementId when verification requires explicit reading.',
                schema: z.object({ elementId: z.number() })
            },
            {
                name: ActionType.NAVIGATE,
                description: 'Navigate to an absolute URL when changing page is required.',
                schema: z.object({ url: z.string().url() })
            },
            {
                name: ActionType.PASS,
                description: 'Mark the current step as completed. Use when evidence indicates the step goal is satisfied.',
                schema: z.object({ summary: z.string().optional() })
            },
            {
                name: ActionType.FAIL,
                description: 'Mark the current step as failed with a concrete reason after re-checking and trying a plausible alternative.',
                schema: z.object({ reason: z.string() })
            }
        ];

        const availableNames = new Set((availableTools ?? []).map(tool => tool.name));
        const allowedActionTypes = new Set<ActionType>([
            ActionType.CLICK,
            ActionType.TYPE,
            ActionType.SCROLL,
            ActionType.MOUSE_MOVE,
            ActionType.MOUSE_CLICK_LEFT,
            ActionType.MOUSE_CLICK_RIGHT,
            ActionType.MOUSE_DOUBLE_CLICK,
            ActionType.MOUSE_DRAG,
            ActionType.MOUSE_SCROLL,
            ActionType.WAIT,
            ActionType.NAVIGATE,
            ActionType.PASS,
            ActionType.FAIL
        ]);

        if (availableNames.size === 0) {
            return allTools.filter(tool => allowedActionTypes.has(tool.name as ActionType));
        }
        const mappedByRegistry = new Set<ActionType>([ActionType.PASS, ActionType.FAIL]);

        if (availableNames.has('click_element')) mappedByRegistry.add(ActionType.CLICK);
        if (availableNames.has('type_text')) mappedByRegistry.add(ActionType.TYPE);
        if (availableNames.has('scroll_page')) mappedByRegistry.add(ActionType.SCROLL);
        if (availableNames.has('mouse_move')) mappedByRegistry.add(ActionType.MOUSE_MOVE);
        if (availableNames.has('mouse_click_left')) mappedByRegistry.add(ActionType.MOUSE_CLICK_LEFT);
        if (availableNames.has('mouse_click_right')) mappedByRegistry.add(ActionType.MOUSE_CLICK_RIGHT);
        if (availableNames.has('mouse_double_click')) mappedByRegistry.add(ActionType.MOUSE_DOUBLE_CLICK);
        if (availableNames.has('mouse_drag')) mappedByRegistry.add(ActionType.MOUSE_DRAG);
        if (availableNames.has('mouse_scroll')) mappedByRegistry.add(ActionType.MOUSE_SCROLL);
        if (availableNames.has('wait')) mappedByRegistry.add(ActionType.WAIT);
        if (availableNames.has('navigate_to')) mappedByRegistry.add(ActionType.NAVIGATE);
        if (availableNames.has('press_key') || availableNames.has('pressKey')) mappedByRegistry.add(ActionType.PRESS_KEY);
        if (availableNames.has('extract_text') || availableNames.has('extract')) mappedByRegistry.add(ActionType.EXTRACT);

        return allTools.filter(tool => mappedByRegistry.has(tool.name as ActionType));
    }

    mapModelToolCallToAction(name: string, args: Record<string, unknown>): AgentAction {
        switch (name) {
            case ActionType.CLICK:
                return {
                    type: ActionType.CLICK,
                    elementId: ElementIdFactory.unsafe(Number(args['elementId'])),
                    thought: 'Tool call: click'
                };
            case ActionType.TYPE:
                return {
                    type: ActionType.TYPE,
                    elementId: ElementIdFactory.unsafe(Number(args['elementId'])),
                    text: String(args['text'] ?? ''),
                    ...(typeof args['submit'] === 'boolean' ? { submit: args['submit'] } : {}),
                    thought: 'Tool call: type'
                };
            case ActionType.PRESS_KEY:
                return { type: ActionType.PRESS_KEY, key: String(args['key'] ?? 'Enter'), thought: 'Tool call: pressKey' };
            case ActionType.SCROLL:
                return {
                    type: ActionType.SCROLL,
                    direction: args['direction'] === 'up' ? 'up' : 'down',
                    thought: 'Tool call: scroll'
                };
            case ActionType.MOUSE_MOVE:
                return {
                    type: ActionType.MOUSE_MOVE,
                    x: Number(args['x'] ?? 0),
                    y: Number(args['y'] ?? 0),
                    thought: 'Tool call: mouse_move'
                };
            case ActionType.MOUSE_CLICK_LEFT:
                return {
                    type: ActionType.MOUSE_CLICK_LEFT,
                    x: Number(args['x'] ?? 0),
                    y: Number(args['y'] ?? 0),
                    thought: 'Tool call: mouse_click_left'
                };
            case ActionType.MOUSE_CLICK_RIGHT:
                return {
                    type: ActionType.MOUSE_CLICK_RIGHT,
                    x: Number(args['x'] ?? 0),
                    y: Number(args['y'] ?? 0),
                    thought: 'Tool call: mouse_click_right'
                };
            case ActionType.MOUSE_DOUBLE_CLICK:
                return {
                    type: ActionType.MOUSE_DOUBLE_CLICK,
                    x: Number(args['x'] ?? 0),
                    y: Number(args['y'] ?? 0),
                    thought: 'Tool call: mouse_double_click'
                };
            case ActionType.MOUSE_DRAG:
                return {
                    type: ActionType.MOUSE_DRAG,
                    fromX: Number(args['fromX'] ?? 0),
                    fromY: Number(args['fromY'] ?? 0),
                    toX: Number(args['toX'] ?? 0),
                    toY: Number(args['toY'] ?? 0),
                    ...(typeof args['steps'] === 'number' ? { steps: args['steps'] } : {}),
                    thought: 'Tool call: mouse_drag'
                };
            case ActionType.MOUSE_SCROLL:
                return {
                    type: ActionType.MOUSE_SCROLL,
                    deltaX: Number(args['deltaX'] ?? 0),
                    deltaY: Number(args['deltaY'] ?? 0),
                    thought: 'Tool call: mouse_scroll'
                };
            case ActionType.WAIT:
                return {
                    type: ActionType.WAIT,
                    durationMs: typeof args['durationMs'] === 'number' ? args['durationMs'] : 1000,
                    thought: 'Tool call: wait'
                };
            case ActionType.EXTRACT:
                return {
                    type: ActionType.EXTRACT,
                    elementId: ElementIdFactory.unsafe(Number(args['elementId'])),
                    thought: 'Tool call: extract'
                };
            case ActionType.NAVIGATE:
                return {
                    type: ActionType.NAVIGATE,
                    url: String(args['url'] ?? ''),
                    thought: 'Tool call: navigate'
                };
            case ActionType.PASS:
                return {
                    type: ActionType.PASS,
                    summary: typeof args['summary'] === 'string' ? args['summary'] : 'Task completed successfully',
                    thought: 'Tool call: pass'
                };
            case ActionType.FAIL:
                return {
                    type: ActionType.FAIL,
                    reason: String(args['reason'] ?? 'Unable to complete task'),
                    thought: 'Tool call: fail'
                };
            default:
                throw new Error(`Unknown tool call: ${name}`);
        }
    }

    getEvaluationToolDefinitions(): ToolCallDefinition[] {
        return [
            {
                name: 'sub_task_success',
                description: 'Sub-task objective is satisfied with current evidence.',
                schema: z.object({ summary: z.string().min(1) })
            },
            {
                name: 'need_retry',
                description: 'Sub-task should retry the same objective with tactical advice.',
                schema: z.object({ summary: z.string().min(1), advice: z.string().min(1) })
            },
            {
                name: 'need_reformulate',
                description: 'Current objective is blocked and should be reformulated.',
                schema: z.object({ summary: z.string().min(1), advice: z.string().min(1).optional() })
            }
        ];
    }

    mapModelToolCallToEvaluationDecision(name: string, args: Record<string, unknown>): LLMEvaluationDecision {
        switch (name) {
            case 'sub_task_success':
                return {
                    decision: 'sub_task_success',
                    summary: String(args['summary'] ?? 'Sub-task completed')
                };
            case 'need_retry':
                return {
                    decision: 'need_retry',
                    summary: String(args['summary'] ?? 'Retry required'),
                    advice: String(args['advice'] ?? 'Retry with an alternative interaction strategy')
                };
            case 'need_reformulate':
                return {
                    decision: 'need_reformulate',
                    summary: String(args['summary'] ?? 'Objective blocked'),
                    ...(typeof args['advice'] === 'string' ? { advice: args['advice'] } : {})
                };
            default:
                throw new Error(`Unknown evaluator tool call: ${name}`);
        }
    }

    mapActionToRegistryToolCall(action: AgentAction, toolContext?: ToolContext): MappedToolRequest | undefined {
        const platform = toolContext?.platform;
        const windowId = toolContext?.platformContext?.electron?.windowId;
        const electronWindowPayload = platform === 'electron' && windowId ? { windowId } : {};

        switch (action.type) {
            case ActionType.CLICK:
                return {
                    toolName: 'click_element',
                    input: {
                        elementId: Number(action.elementId),
                        ...electronWindowPayload
                    }
                };
            case ActionType.TYPE:
                return {
                    toolName: 'type_text',
                    input: {
                        elementId: Number(action.elementId),
                        text: action.text,
                        ...(action.submit ? { submit: action.submit } : {}),
                        ...electronWindowPayload
                    }
                };
            case ActionType.SCROLL:
                return {
                    toolName: 'scroll_page',
                    input: {
                        direction: action.direction,
                        ...electronWindowPayload
                    }
                };
            case ActionType.MOUSE_MOVE:
                return {
                    toolName: 'mouse_move',
                    input: {
                        x: action.x,
                        y: action.y,
                        ...electronWindowPayload
                    }
                };
            case ActionType.MOUSE_CLICK_LEFT:
                return {
                    toolName: 'mouse_click_left',
                    input: {
                        x: action.x,
                        y: action.y,
                        ...electronWindowPayload
                    }
                };
            case ActionType.MOUSE_CLICK_RIGHT:
                return {
                    toolName: 'mouse_click_right',
                    input: {
                        x: action.x,
                        y: action.y,
                        ...electronWindowPayload
                    }
                };
            case ActionType.MOUSE_DOUBLE_CLICK:
                return {
                    toolName: 'mouse_double_click',
                    input: {
                        x: action.x,
                        y: action.y,
                        ...electronWindowPayload
                    }
                };
            case ActionType.MOUSE_DRAG:
                return {
                    toolName: 'mouse_drag',
                    input: {
                        fromX: action.fromX,
                        fromY: action.fromY,
                        toX: action.toX,
                        toY: action.toY,
                        ...(action.steps !== undefined ? { steps: action.steps } : {}),
                        ...electronWindowPayload
                    }
                };
            case ActionType.MOUSE_SCROLL:
                return {
                    toolName: 'mouse_scroll',
                    input: {
                        deltaX: action.deltaX,
                        deltaY: action.deltaY,
                        ...electronWindowPayload
                    }
                };
            case ActionType.WAIT:
                return {
                    toolName: 'wait',
                    input: { durationMs: action.durationMs }
                };
            case ActionType.NAVIGATE:
                return {
                    toolName: 'navigate_to',
                    input: { url: action.url }
                };
            default:
                return undefined;
        }
    }
}
