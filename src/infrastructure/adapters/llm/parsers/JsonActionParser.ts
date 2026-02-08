import { ResultAsync } from 'neverthrow';
import { AgentAction } from '../../../../domain/value-objects/AgentAction';
import { IActionParser } from '../../../../domain/ports/IActionParser';
import { LLMError } from '../../../../domain/errors/LLMErrors';
import { AgentActionFactory } from '../../../../domain/factories/AgentActionFactory';
import { AgentActionType } from '../../../../domain/enums/AgentActionType';

export class JsonActionParser implements IActionParser {
    parse(text: string): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            (async () => this.doParseAction(text))(),
            (e) => new LLMError(`Failed to parse LLM response: ${String(e)}`)
        );
    }

    private doParseAction(text: string): AgentAction {
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

        const sanitizedJson = this.sanitizeJson(jsonStr);

        let parsed: any;
        try {
            parsed = JSON.parse(sanitizedJson);
        } catch (e) {
            throw new LLMError(`JSON parse error: ${String(e)}\nInput: ${sanitizedJson}`);
        }

        const { action, thought = '' } = parsed;

        if (!action || !action.type) {
            throw new LLMError('Missing "action" or "action.type" in LLM response');
        }

        switch (action.type) {
            case AgentActionType.CLICK:
                return this.unwrapOrThrow(AgentActionFactory.createClick(action.elementId, thought));
            case AgentActionType.TYPE:
                return this.unwrapOrThrow(AgentActionFactory.createType(action.elementId, action.text ?? '', action.submit ?? false, thought));
            case AgentActionType.PRESS_KEY:
                return this.unwrapOrThrow(AgentActionFactory.createPressKey(action.key ?? 'Enter', thought));
            case AgentActionType.SCROLL:
                return this.unwrapOrThrow(AgentActionFactory.createScroll(action.direction === 'up' ? 'up' : 'down', thought));
            case AgentActionType.WAIT:
                return this.unwrapOrThrow(AgentActionFactory.createWait(action.durationMs ?? 1000, thought));
            case AgentActionType.EXTRACT:
                return this.unwrapOrThrow(AgentActionFactory.createExtract(action.elementId, thought));
            case AgentActionType.NAVIGATE:
                return this.unwrapOrThrow(AgentActionFactory.createNavigate(action.url ?? '', thought));
            case AgentActionType.ASK_USER:
                return this.unwrapOrThrow(AgentActionFactory.createAskUser(action.question ?? '', thought));
            case AgentActionType.PASS:
                return this.unwrapOrThrow(AgentActionFactory.createPass(action.summary ?? 'Test passed', thought));
            case AgentActionType.FAIL:
                return this.unwrapOrThrow(AgentActionFactory.createFail(action.reason ?? 'Test failed', thought));
            default:
                throw new LLMError(`Unknown action type: ${action.type}`);
        }
    }

    private unwrapOrThrow<T, E extends Error>(result: { isOk: () => boolean, isErr: () => boolean, value?: T, error?: E }): T {
        if (result.isOk()) {
            return result.value as T;
        } else {
            const errorMsg = result.error?.message ?? 'Unknown validation error';
            throw new LLMError(`Action validation failed: ${errorMsg}`);
        }
    }

    private sanitizeJson(jsonStr: string): string {
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
        return sanitized;
    }
}
