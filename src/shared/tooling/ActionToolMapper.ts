import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ActionType } from '@domain/enums/ActionType';
import { ElementIdFactory } from '@domain/value-objects';
import type { AgentAction } from '@domain/value-objects';
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
                description: 'Click on an element by its numeric ID.',
                schema: z.object({ elementId: z.number() })
            },
            {
                name: ActionType.TYPE,
                description: 'Type text into an element by ID, optionally submitting with Enter.',
                schema: z.object({ elementId: z.number(), text: z.string(), submit: z.boolean().optional() })
            },
            {
                name: ActionType.PRESS_KEY,
                description: 'Press a keyboard key.',
                schema: z.object({ key: z.string() })
            },
            {
                name: ActionType.SCROLL,
                description: 'Scroll the page up or down.',
                schema: z.object({ direction: z.enum(['up', 'down']) })
            },
            {
                name: ActionType.WAIT,
                description: 'Wait for a number of milliseconds.',
                schema: z.object({ durationMs: z.number().optional() })
            },
            {
                name: ActionType.EXTRACT,
                description: 'Extract text from an element by ID.',
                schema: z.object({ elementId: z.number() })
            },
            {
                name: ActionType.NAVIGATE,
                description: 'Navigate to a full URL.',
                schema: z.object({ url: z.string().url() })
            },
            {
                name: ActionType.PASS,
                description: 'Mark the current step as successfully completed.',
                schema: z.object({ summary: z.string().optional() })
            },
            {
                name: ActionType.FAIL,
                description: 'Mark the current step as failed with a reason.',
                schema: z.object({ reason: z.string() })
            }
        ];

        const availableNames = new Set((availableTools ?? []).map(tool => tool.name));
        if (availableNames.size === 0) {
            return allTools;
        }

        const allowedActionTypes = new Set<ActionType>([ActionType.PASS, ActionType.FAIL]);

        if (availableNames.has('click_element')) allowedActionTypes.add(ActionType.CLICK);
        if (availableNames.has('type_text')) allowedActionTypes.add(ActionType.TYPE);
        if (availableNames.has('scroll_page')) allowedActionTypes.add(ActionType.SCROLL);
        if (availableNames.has('wait')) allowedActionTypes.add(ActionType.WAIT);
        if (availableNames.has('navigate_to')) allowedActionTypes.add(ActionType.NAVIGATE);

        return allTools.filter(tool => allowedActionTypes.has(tool.name as ActionType));
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
