import type { BaseLlm, LlmRequest } from '@google/adk';

/** One-shot, non-streaming text generation against an ADK `BaseLlm`. Shared by the
 *  planner (W9) and evaluator (W10), which need a single structured reply, not a loop. */
export async function generateText(llm: BaseLlm, prompt: string): Promise<string> {
    const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] } as unknown as LlmRequest;
    let out = '';
    for await (const response of llm.generateContentAsync(request, false)) {
        const parts = (response as { content?: { parts?: Array<{ text?: string }> } }).content?.parts ?? [];
        for (const part of parts) {
            if (typeof part.text === 'string') out += part.text;
        }
    }
    return out.trim();
}

/** Strip markdown code fences so defensive JSON.parse sees raw JSON (model output often fenced). */
export function stripJsonFences(text: string): string {
    return text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}
