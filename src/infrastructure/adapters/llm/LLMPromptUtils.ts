
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { LLMContext } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { ElementIdFactory } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LLMError } from '@domain/errors';

import { ActionSchema } from '@domain/schemas/ActionSchema';
import { normalizeActionPayload } from './ActionPayloadNormalizer';

export const LLMPromptUtils = {
    systemPrompt: `You are an autonomous web testing agent. You interact with web pages to verify conditions and achieve goals.
    
CAPABILITIES:
- You can click, type, pressKey, scroll, wait, and extract data.
- You receive bounding box coordinates for every element.
- You receive the viewport dimensions to calculate positions.

TOOLS:
- click
- type
- pressKey
- scroll
- wait
- extract
- navigate
- pass
- fail

LAYOUT ANALYSIS:
To check if an element is horizontally centered:
  - Element center: elementX + (elementWidth / 2)
  - Page center: viewportWidth / 2
  - Centered if: |elementCenter - pageCenter| < 50 pixels

RULES:
1. Analyze elements and their positions before deciding.
2. Use element IDs from the snapshot to target elements.
3. Action types must be lowercase: "click", "type", "pass", "fail", etc.
4. To pass, return action: { "type": "pass", "summary": "Goal achieved" }
5. To fail, return action: { "type": "fail", "reason": "Cannot proceed because..." }

RESPONSE FORMAT (JSON only):
{
  "thought": "Reasoning...",
  "action": {
    "type": "tool_name",
    ...params
  }
}
`,

    buildUserPrompt(context: LLMContext): string {

        const elementsStr = context.snapshot.elements
            .slice(0, 50)
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

        const formatAttributes = (attrs: Record<string, string>): string =>
            Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') || 'None';

        const previousActionsStr = context.previousActions
            .slice(-5)
            .map((a, i) => {
                const desc = ('elementDescriptor' in a && a.elementDescriptor) ? ` on ${a.elementDescriptor}` : '';
                if (a.type === ActionType.PRESS_KEY) return `${i + 1}. pressKey(${a.key})`;
                if (a.type === ActionType.NAVIGATE) return `${i + 1}. navigate to ${a.url}`;
                return `${i + 1}. ${a.type}${desc}`;
            })
            .join('\n');

        // Fix for untyped plan using unknown and manual check/cast
        const formatPlan = (p: unknown): string => {
            const plan = p as { items: { status: string; description: string }[] };
            if (!plan || !plan.items) return 'No active plan.';
            return plan.items.map(item => `- [${item.status.toUpperCase()}] ${item.description}`).join('\n');
        };

        return `GOAL: ${context.goal}

VIEWPORT: ${context.viewport.width}x${context.viewport.height} pixels

CURRENT PAGE:
URL: ${context.currentUrl}
Title: ${context.pageTitle}

ROOT ELEMENTS:
- <html> attributes: ${formatAttributes(context.snapshot.rootElements.html)}
- <body> attributes: ${formatAttributes(context.snapshot.rootElements.body)}

INTERACTIVE ELEMENTS (with bounding boxes [x,y,w,h]):
${elementsStr}

PREVIOUS ACTIONS:
${previousActionsStr || 'None yet'}

CURRENT PLAN:
${formatPlan(context.plan)}

STEPS REMAINING: ${context.stepsRemaining}

Analyze the elements and their positions, then respond with a single JSON action:`;
    },

    buildFullPrompt(context: LLMContext, toolDescriptions: string = ''): string {
        const sysPrompt = this.systemPrompt.replace('${toolDescriptions}', toolDescriptions);
        return `${sysPrompt}\n\n---\n\n${this.buildUserPrompt(context)}`;
    },

    parseAction(text: string, context?: LLMContext): ResultAsync<AgentAction, LLMError> {
        try {
            const action = this.doParseAction(text, context);
            return okAsync(action);
        } catch (e) {
            return errAsync(new LLMError(`Failed to parse LLM response: ${String(e)}`));
        }
    },

    doParseAction(text: string, context?: LLMContext): AgentAction {
        if (!text || text.trim().length === 0) {
            throw new LLMError('LLM returned empty response');
        }

        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        let jsonStr = jsonMatch ? jsonMatch[1]?.trim() : text.trim();

        if (!jsonStr || !jsonStr.startsWith('{')) {
            const jsonObjMatch = text.match(/\{[\s\S]*\}/);
            if (jsonObjMatch) {
                jsonStr = jsonObjMatch[0];
            }
        }

        if (!jsonStr || jsonStr.length === 0) {
            throw new LLMError(`Could not extract JSON from response: ${text.substring(0, 200)}`);
        }

        // Sanitize JSON string: escape unescaped control characters
        let sanitized = '';
        let inString = false;
        let isEscaped = false;

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (inString) {
                if (char === '\\') {
                    isEscaped = !isEscaped;
                    sanitized += char;
                } else if (char === '"' && !isEscaped) {
                    inString = false;
                    sanitized += char;
                } else if (char === '\n') {
                    sanitized += '\\n';
                    isEscaped = false;
                } else if (char === '\r') {
                    sanitized += '\\r';
                    isEscaped = false;
                } else if (char === '\t') {
                    sanitized += '\\t';
                    isEscaped = false;
                } else if (char && char.charCodeAt(0) < 0x20) {
                    isEscaped = false;
                } else {
                    sanitized += char;
                    isEscaped = false;
                }
            } else {
                if (char === '"') {
                    inString = true;
                    sanitized += char;
                } else {
                    sanitized += char;
                }
            }
        }
        jsonStr = sanitized;

        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            throw new LLMError(`JSON Syntax Error: ${String(e)} in payload: ${jsonStr.substring(0, 100)}...`);
        }

        parsed = normalizeActionPayload(parsed);

        const validationResult = ActionSchema.safeParse(parsed);

        if (!validationResult.success) {
            const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
            const payload = JSON.stringify(parsed).slice(0, 400);
            throw new LLMError(`Schema Validation Failed: ${errors}. Payload: ${payload}`);
        }

        const { action, thought = '' } = validationResult.data;

        const getDescriptor = (id: number): string | undefined => {
            if (!context) return undefined;
            const el = context.snapshot.elements.find(e => Number(e.id) === id);
            if (!el) return undefined;
            return `${el.tag} "${el.text.slice(0, 30)}"`;
        };

        switch (action.type) {
            case ActionType.CLICK:
                return {
                    type: ActionType.CLICK,
                    elementId: ElementIdFactory.unsafe(action.elementId),
                    elementDescriptor: getDescriptor(action.elementId),
                    thought
                };
            case ActionType.TYPE:
                return {
                    type: ActionType.TYPE,
                    elementId: ElementIdFactory.unsafe(action.elementId),
                    elementDescriptor: getDescriptor(action.elementId),
                    text: action.text,
                    submit: action.submit ?? false,
                    thought
                };
            case ActionType.PRESS_KEY:
                return { type: ActionType.PRESS_KEY, key: action.key, thought };
            case ActionType.SCROLL:
                return { type: ActionType.SCROLL, direction: action.direction, thought };
            case ActionType.WAIT:
                return { type: ActionType.WAIT, durationMs: action.durationMs, thought };
            case ActionType.EXTRACT:
                return {
                    type: ActionType.EXTRACT,
                    elementId: ElementIdFactory.unsafe(action.elementId),
                    elementDescriptor: getDescriptor(action.elementId),
                    thought
                };
            case ActionType.NAVIGATE:
                return { type: ActionType.NAVIGATE, url: action.url, thought };
            case ActionType.PASS:
                return { type: ActionType.PASS, summary: action.summary, thought };
            case ActionType.FAIL:
                return { type: ActionType.FAIL, reason: action.reason, thought };
            default:
                throw new LLMError(`Unknown action type`);
        }
    },
};
