import { describe, it, expect } from 'vitest';
import { JsonActionParser } from './JsonActionParser';
import { AgentActionType } from '../../../../domain/enums/AgentActionType';
import { LLMError } from '../../../../domain/errors/LLMErrors';

describe('JsonActionParser', () => {
    const parser = new JsonActionParser();

    it('should parse valid JSON action', async () => {
        const input = JSON.stringify({
            thought: 'Found the button',
            action: {
                type: 'click',
                elementId: 123
            }
        });
        const result = await parser.parse(input);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.type).toBe(AgentActionType.CLICK);
            // @ts-ignore
            expect(result.value.elementId).toBe(123); // Brand type nominal check might fail strict equality if not cast, but value should match
            expect(result.value.thought).toBe('Found the button');
        }
    });

    it('should parse JSON inside markdown block', async () => {
        const input = `Here is the action:
\`\`\`json
{
    "thought": "Typing text",
    "action": {
        "type": "type",
        "elementId": 456,
        "text": "hello",
        "submit": true
    }
}
\`\`\`
`;
        const result = await parser.parse(input);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.type).toBe(AgentActionType.TYPE);
        }
    });

    it('should sanitize control characters', async () => {
        // The parser sanitizes input string before parsing if needed, but JSON.parse handles escaped chars.
        // The parser's sanitizer handles unescaped newlines inside strings which is invalid JSON.
        // Let's test that specifically.
        const invalidJson = `{"thought": "Multi
line", "action": {"type": "pass"}}`; // Raw newline in string is invalid JSON

        const result = await parser.parse(invalidJson);
        expect(result.isOk()).toBe(true);
    });

    it('should return error for invalid JSON', async () => {
        const input = 'Not JSON at all';
        const result = await parser.parse(input);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(LLMError);
        }
    });

    it('should return error for missing action type', async () => {
        const input = JSON.stringify({ thought: 'No action here' });
        const result = await parser.parse(input);
        expect(result.isErr()).toBe(true);
    });

    it('should return error for unknown action type', async () => {
        const input = JSON.stringify({ action: { type: 'magic_wand' } });
        const result = await parser.parse(input);
        expect(result.isErr()).toBe(true);
    });
});
