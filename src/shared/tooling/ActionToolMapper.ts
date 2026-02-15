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
