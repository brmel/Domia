import { ResultAsync } from 'neverthrow';
import type { LLMContext } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { ElementIdFactory } from '@domain/value-objects';
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
- extract: { "type": "extract", "key": "<key>", "value": "<value>" }
- navigate: { "type": "navigate", "url": "<url>" }
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
        jsonStr = jsonStr.replace(/[\u0000-\u001F]+/g, (match) => {
            // Allow standard whitespace
            if (match === '\n' || match === '\r' || match === '\t') return match;
            return '';
        });

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
                summary?: string;
                reason?: string;
            };
        };

        const { action, thought = '' } = parsed;

        switch (action.type) {
            case 'click':
                return { type: 'click', elementId: ElementIdFactory.unsafe(action.elementId!), thought };
            case 'type':
                return { type: 'type', elementId: ElementIdFactory.unsafe(action.elementId!), text: action.text ?? '', submit: action.submit ?? false, thought };
            case 'pressKey':
                return { type: 'pressKey', key: action.key ?? 'Enter', thought };
            case 'scroll':
                return { type: 'scroll', direction: action.direction === 'up' ? 'up' : 'down', thought };
            case 'wait':
                return { type: 'wait', durationMs: action.durationMs ?? 1000, thought };
            case 'extract':
                return { type: 'extract', key: action.keyName ?? action.key ?? '', value: action.value ?? '', thought };
            case 'navigate':
                return { type: 'navigate', url: action.url ?? '', thought };
            case 'pass':
                return { type: 'pass', summary: action.summary ?? 'Test passed', thought };
            case 'fail':
                return { type: 'fail', reason: action.reason ?? 'Test failed', thought };
            default:
                throw new LLMError(`Unknown action type: ${action.type}`);
        }
    },
};
