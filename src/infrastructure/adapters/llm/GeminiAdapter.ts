import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ILLMProvider, LLMContext } from '@domain/ports';
import type { AgentAction, ElementId } from '@domain/value-objects';
import { LLMError } from '@domain/errors';
import type { LLMConfig } from './VercelAIAdapter';

/**
 * GeminiAdapter
 * Native implementation using @google/generative-ai SDK
 * Use this if the Vercel AI SDK has issues with Gemini
 */
@injectable()
export class GeminiAdapter implements ILLMProvider {
    readonly providerName: string;
    private readonly genAI: GoogleGenerativeAI;
    private readonly modelName: string;

    constructor(@inject('LLMConfig') config: LLMConfig) {
        this.genAI = new GoogleGenerativeAI(config.apiKey);
        this.modelName = config.model;
        this.providerName = `google/${config.model}`;
    }

    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            this.doGenerateAction(context),
            (e) => new LLMError(`LLM generation failed: ${String(e)}`)
        ).andThen((text) => this.parseAction(text));
    }

    private async doGenerateAction(context: LLMContext): Promise<string> {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const prompt = this.buildFullPrompt(context);

        console.log('[GeminiAdapter] Sending prompt, length:', prompt.length, 'characters');

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        console.log('[GeminiAdapter] Response length:', text?.length ?? 0);
        console.log('[GeminiAdapter] Response text:', text?.substring(0, 500));

        return text;
    }

    private buildFullPrompt(context: LLMContext): string {
        const systemPrompt = `You are an autonomous web testing agent. Your task is to interact with web pages to achieve a goal.

RULES:
1. Analyze the DOM elements and decide on ONE action to take
2. Use element IDs from the snapshot to target elements
3. Be precise and deliberate with each action
4. If the goal is achieved, respond with a "pass" action
5. If the goal cannot be achieved, respond with a "fail" action

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
- fail: { "type": "fail", "reason": "<failure reason>" }`;

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

        const userPrompt = `GOAL: ${context.goal}

CURRENT PAGE:
URL: ${context.currentUrl}
Title: ${context.pageTitle}

INTERACTIVE ELEMENTS:
${elementsStr}

PREVIOUS ACTIONS:
${previousActionsStr || 'None yet'}

STEPS REMAINING: ${context.stepsRemaining}

Respond with a single JSON action (no markdown, just the JSON object):`;

        return `${systemPrompt}\n\n---\n\n${userPrompt}`;
    }

    private parseAction(text: string): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            Promise.resolve(this.doParseAction(text)),
            (e) => new LLMError(`Failed to parse LLM response: ${String(e)}`)
        );
    }

    private doParseAction(text: string): AgentAction {
        console.log('[GeminiAdapter] Parsing response:', text.substring(0, 300));

        if (!text || text.trim().length === 0) {
            throw new Error('LLM returned empty response');
        }

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        let jsonStr = jsonMatch ? jsonMatch[1]?.trim() : text.trim();

        // Try to find JSON object if not in code block
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
                return {
                    type: 'click',
                    elementId: action.elementId as unknown as ElementId,
                    thought,
                };
            case 'type':
                return {
                    type: 'type',
                    elementId: action.elementId as unknown as ElementId,
                    text: action.text ?? '',
                    thought,
                };
            case 'scroll':
                return {
                    type: 'scroll',
                    direction: action.direction === 'up' ? 'up' : 'down',
                    thought,
                };
            case 'wait':
                return {
                    type: 'wait',
                    durationMs: action.durationMs ?? 1000,
                    thought,
                };
            case 'extract':
                return {
                    type: 'extract',
                    key: action.key ?? '',
                    value: action.value ?? '',
                    thought,
                };
            case 'pass':
                return {
                    type: 'pass',
                    summary: action.summary ?? 'Test passed',
                };
            case 'fail':
                return {
                    type: 'fail',
                    reason: action.reason ?? 'Test failed',
                };
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }
}
