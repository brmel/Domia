import { ResultAsync } from 'neverthrow';
import type { LLMContext } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { ElementIdFactory } from '@domain/value-objects';
import { AgentActionType } from '@domain/enums/AgentActionType';
import { LLMError } from '@domain/errors';

export const LLMPromptUtils = {
    systemPrompt: `You are an autonomous web testing agent. You interact with web pages to verify conditions and achieve goals.

CAPABILITIES:
- You can click, type, press keys, scroll, wait, and extract data
- You receive bounding box coordinates (x, y, width, height) for every element
- You receive the viewport dimensions to calculate positions and layouts
- You can verify visual layout properties using math on bounding boxes

LAYOUT ANALYSIS:
To check if an element is horizontally centered:
  - Element center: elementX + (elementWidth / 2)
  - Page center: viewportWidth / 2
  - Centered if: |elementCenter - pageCenter| < 50 pixels

To check vertical centering, alignment, or spacing:
  - Use the y, height values and viewportHeight similarly

RULES:
1. Analyze elements and their positions before deciding
2. Use element IDs from the snapshot to target elements
3. If the goal requires layout verification, calculate positions using bounding boxes
4. Respond with PASS if the goal is satisfied
5. Respond with FAIL if the goal cannot be achieved or conditions are not met
6. to Submit a form, use the 'type' action with "submit": true.

CRITICAL: When asked to verify something:
- If the condition is FALSE, you MUST fail with a reason
- "Pass" means the user's requirement IS satisfied
- Calculate and verify, don't guess

RESPONSE FORMAT (JSON only, no markdown):
{
  "thought": "Your reasoning, include calculations if verifying layout",
  "action": {
    "type": "click|type|pressKey|scroll|wait|extract|pass|fail",
    ...action-specific fields
  }
}

ACTION TYPES:
- click: { "type": "click", "elementId": <number> }
- type: { "type": "type", "elementId": <number>, "text": "<text>", "submit": <boolean> }
- pressKey: { "type": "pressKey", "key": "<Enter|Tab|Escape|...>" }
- scroll: { "type": "scroll", "direction": "up|down" }
- wait: { "type": "wait", "durationMs": <number> }
- extract: { "type": "extract", "elementId": <number> }
- navigate: { "type": "navigate", "url": "<url>" }
- ask_user: { "type": "ask_user", "question": "<question>" }
- pass: { "type": "pass", "summary": "<success summary with evidence>" }
- fail: { "type": "fail", "reason": "<failure reason with evidence>" }`,

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

        const previousActionsStr = context.previousActions
            .slice(-5)
            .map((a, i) => {
                if (a.type === 'pressKey') return `${i + 1}. pressKey(${a.key})`;
                return `${i + 1}. ${a.type}`;
            })
            .join('\n');

        return `GOAL: ${context.goal}

VIEWPORT: ${context.viewport.width}x${context.viewport.height} pixels

CURRENT PAGE:
URL: ${context.currentUrl}
Title: ${context.pageTitle}
Root Classes: ${context.snapshot.rootClasses}

INTERACTIVE ELEMENTS (with bounding boxes [x,y,w,h]):
${elementsStr}

PREVIOUS ACTIONS:
${previousActionsStr || 'None yet'}

STEPS REMAINING: ${context.stepsRemaining}

Analyze the elements and their positions, then respond with a single JSON action:`;
    },

    buildFullPrompt(context: LLMContext): string {
        return `${this.systemPrompt}\n\n---\n\n${this.buildUserPrompt(context)}`;
    },

    parseAction(text: string): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            Promise.resolve(this.doParseAction(text)),
            (e) => new LLMError(`Failed to parse LLM response: ${String(e)}`)
        );
    },

    doParseAction(text: string): AgentAction {
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
        // We use a simple state machine to escape newlines inside strings
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
                    // Escape newline inside string
                    sanitized += '\\n';
                    isEscaped = false; // Reset escape state
                } else if (char === '\r') {
                    // Ignore CR inside string or escape it? Better to ignore or convert to \r
                    sanitized += '\\r';
                    isEscaped = false;
                } else if (char === '\t') {
                    // Tab is allowed in string? Actually tab in string MUST be escaped in JSON
                    sanitized += '\\t';
                    isEscaped = false;
                } else if (char && char.charCodeAt(0) < 0x20) {
                    // Other control chars - ignore
                    isEscaped = false;
                } else {
                    sanitized += char;
                    isEscaped = false;
                }
            } else {
                // Not in string - preserve structural chars, ignore whitespace/control if needed or keep for formatting
                if (char === '"') {
                    inString = true;
                    sanitized += char;
                } else {
                    sanitized += char;
                }
            }
        }
        jsonStr = sanitized;

        const parsed = JSON.parse(jsonStr) as {
            thought?: string;
            action: {
                type: string;
                elementId?: number;
                text?: string;
                submit?: boolean;
                key?: string;
                direction?: string;
                durationMs?: number;
                keyName?: string;
                value?: string;
                url?: string;
                question?: string;
                summary?: string;
                reason?: string;
            };
        };

        const { action, thought = '' } = parsed;

        switch (action.type) {
            case AgentActionType.CLICK:
                return { type: AgentActionType.CLICK, elementId: ElementIdFactory.unsafe(action.elementId!), thought };
            case AgentActionType.TYPE:
                return { type: AgentActionType.TYPE, elementId: ElementIdFactory.unsafe(action.elementId!), text: action.text ?? '', submit: action.submit ?? false, thought };
            case AgentActionType.PRESS_KEY:
                return { type: AgentActionType.PRESS_KEY, key: action.key ?? 'Enter', thought };
            case AgentActionType.SCROLL:
                return { type: AgentActionType.SCROLL, direction: action.direction === 'up' ? 'up' : 'down', thought };
            case AgentActionType.WAIT:
                return { type: AgentActionType.WAIT, durationMs: action.durationMs ?? 1000, thought };
            case AgentActionType.EXTRACT:
                return { type: AgentActionType.EXTRACT, elementId: ElementIdFactory.unsafe(action.elementId!), thought };
            case AgentActionType.NAVIGATE:
                return { type: AgentActionType.NAVIGATE, url: action.url ?? '', thought };
            case AgentActionType.ASK_USER:
                return { type: AgentActionType.ASK_USER, question: action.question ?? '', thought };
            case AgentActionType.PASS:
                return { type: AgentActionType.PASS, summary: action.summary ?? 'Test passed', thought };
            case AgentActionType.FAIL:
                return { type: AgentActionType.FAIL, reason: action.reason ?? 'Test failed', thought };
            default:
                throw new LLMError(`Unknown action type: ${action.type}`);
        }
    },
};
