import { ResultAsync } from 'neverthrow';
import type { LLMContext } from '@domain/ports';
import type { AgentAction, ElementId } from '@domain/value-objects';
import { LLMError } from '@domain/errors';

/**
 * Shared LLM prompt building and response parsing logic.
 * Used by both GeminiAdapter and VercelAIAdapter.
 */
export const LLMPromptUtils = {
    systemPrompt: `You are an autonomous web testing agent. Your task is to interact with web pages to achieve a goal.

RULES:
1. Analyze the DOM elements and decide on ONE action to take
2. Use element IDs from the snapshot to target elements
3. Be precise and deliberate with each action
4. If the goal is achieved, respond with a "pass" action
5. If the goal cannot be achieved, respond with a "fail" action

CRITICAL VALIDATION RULE: 
If the user asks to "verify" or "check" something, and the condition is FALSE or elements are MISSING, you MUST use the "fail" action.
Example: User asks "Verify 3 links exist". You find only 1. Action MUST be "fail" with reason "Found only 1 link".
Do NOT use "pass" just because you successfully finished counting. "Pass" means the *user's requirement* was satisfied.

RESPONSE FORMAT (JSON only, no markdown):
{
  "thought": "Your reasoning for this action",
  "action": {
    "type": "click|type|scroll|wait|extract|pass|fail",
    ...action-specific fields
  }
}

ACTION TYPES:
- click: { "type": "click", "elementId": <number> }
- type: { "type": "type", "elementId": <number>, "text": "<text>" }
- scroll: { "type": "scroll", "direction": "up|down" }
- wait: { "type": "wait", "durationMs": <number> }
- extract: { "type": "extract", "key": "<key>", "value": "<value>" }
- pass: { "type": "pass", "summary": "<success summary>" }
- fail: { "type": "fail", "reason": "<failure reason>" }`,

    buildUserPrompt(context: LLMContext): string {
        const elementsStr = context.snapshot.elements
            .slice(0, 50)
            .map((el) => {
                const attrs = Object.entries(el.attributes)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(' ');
                return `[${el.id}] <${el.tag} ${attrs}>${el.text.slice(0, 50)}</${el.tag}>`;
            })
            .join('\n');

        const previousActionsStr = context.previousActions
            .slice(-5)
            .map((a, i) => `${i + 1}. ${a.type}`)
            .join('\n');

        return `GOAL: ${context.goal}

CURRENT PAGE:
URL: ${context.currentUrl}
Title: ${context.pageTitle}

INTERACTIVE ELEMENTS:
${elementsStr}

PREVIOUS ACTIONS:
${previousActionsStr || 'None yet'}

STEPS REMAINING: ${context.stepsRemaining}

Respond with a single JSON action (no markdown, just the JSON object):`;
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
            throw new Error('LLM returned empty response');
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
            throw new Error(`Could not extract JSON from response: ${text.substring(0, 200)}`);
        }

        const parsed = JSON.parse(jsonStr) as {
            thought?: string;
            action: {
                type: string;
                elementId?: number;
                text?: string;
                direction?: string;
                durationMs?: number;
                key?: string;
                value?: string;
                summary?: string;
                reason?: string;
            };
        };

        const { action, thought = '' } = parsed;

        switch (action.type) {
            case 'click':
                return { type: 'click', elementId: action.elementId as unknown as ElementId, thought };
            case 'type':
                return { type: 'type', elementId: action.elementId as unknown as ElementId, text: action.text ?? '', thought };
            case 'scroll':
                return { type: 'scroll', direction: action.direction === 'up' ? 'up' : 'down', thought };
            case 'wait':
                return { type: 'wait', durationMs: action.durationMs ?? 1000, thought };
            case 'extract':
                return { type: 'extract', key: action.key ?? '', value: action.value ?? '', thought };
            case 'pass':
                return { type: 'pass', summary: action.summary ?? 'Test passed' };
            case 'fail':
                return { type: 'fail', reason: action.reason ?? 'Test failed' };
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    },
};
