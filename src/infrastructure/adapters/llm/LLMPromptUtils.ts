import { ResultAsync } from 'neverthrow';
import type { LLMContext } from '../../../domain/ports/ILLMProvider';
import type { AgentAction } from '../../../domain/value-objects/AgentAction';
import { LLMError } from '../../../domain/errors/LLMErrors';
import { JsonActionParser } from './parsers/JsonActionParser';

// Stateless parser instance
const parser = new JsonActionParser();

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
        return parser.parse(text);
    }
};
