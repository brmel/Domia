import { Result, ok, err } from 'neverthrow';
import { AgentActionType } from '../enums/AgentActionType';
import { ElementIdFactory } from '../value-objects/ElementId';
import { UrlFactory } from '../value-objects/Url';
import {
    ClickAction,
    TypeAction,
    ScrollAction,
    WaitAction,
    PressKeyAction,
    ExtractAction,
    NavigateAction,
    AskUserAction,
    PassAction,
    FailAction
} from '../value-objects/AgentAction';
import { ValidationError } from '../errors/ValidationError';

/**
 * Factory for creating AgentAction instances with validation.
 * Centralizes the logic for constructing valid action objects.
 */
export class AgentActionFactory {

    static createClick(elementId: number, thought: string): Result<ClickAction, ValidationError> {
        const idResult = ElementIdFactory.create(elementId);
        if (idResult.isErr()) return err(idResult.error);

        return ok({
            type: AgentActionType.CLICK,
            elementId: idResult.value,
            thought
        });
    }

    static createType(elementId: number, text: string, submit: boolean, thought: string): Result<TypeAction, ValidationError> {
        const idResult = ElementIdFactory.create(elementId);
        if (idResult.isErr()) return err(idResult.error);

        return ok({
            type: AgentActionType.TYPE,
            elementId: idResult.value,
            text,
            submit,
            thought
        });
    }

    static createScroll(direction: string, thought: string): Result<ScrollAction, ValidationError> {
        if (direction !== 'up' && direction !== 'down') {
            return err(new ValidationError(`Invalid scroll direction: ${direction}`, 'direction'));
        }
        return ok({
            type: AgentActionType.SCROLL,
            direction: direction as 'up' | 'down',
            thought
        });
    }

    static createWait(durationMs: number, thought: string): Result<WaitAction, ValidationError> {
        if (durationMs < 0) {
            return err(new ValidationError(`Invalid wait duration: ${durationMs}`, 'durationMs'));
        }
        return ok({
            type: AgentActionType.WAIT,
            durationMs,
            thought
        });
    }

    static createPressKey(key: string, thought: string): Result<PressKeyAction, ValidationError> {
        if (!key) {
            return err(new ValidationError('Key cannot be empty', 'key'));
        }
        return ok({
            type: AgentActionType.PRESS_KEY,
            key,
            thought
        });
    }

    static createExtract(elementId: number, thought: string): Result<ExtractAction, ValidationError> {
        const idResult = ElementIdFactory.create(elementId);
        if (idResult.isErr()) return err(idResult.error);

        return ok({
            type: AgentActionType.EXTRACT,
            elementId: idResult.value,
            thought
        });
    }

    static createNavigate(url: string, thought: string): Result<NavigateAction, ValidationError> {
        const urlResult = UrlFactory.create(url);
        if (urlResult.isErr()) return err(urlResult.error);

        return ok({
            type: AgentActionType.NAVIGATE,
            url: urlResult.value,
            thought
        });
    }

    static createAskUser(question: string, thought: string): Result<AskUserAction, ValidationError> {
        if (!question) {
            return err(new ValidationError('Question cannot be empty', 'question'));
        }
        return ok({
            type: AgentActionType.ASK_USER,
            question,
            thought
        });
    }

    static createPass(summary: string, thought: string): Result<PassAction, ValidationError> {
        return ok({
            type: AgentActionType.PASS,
            summary,
            thought
        });
    }

    static createFail(reason: string, thought: string): Result<FailAction, ValidationError> {
        return ok({
            type: AgentActionType.FAIL,
            reason,
            thought
        });
    }
}
