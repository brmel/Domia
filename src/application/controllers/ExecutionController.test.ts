import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ExecutionController } from './ExecutionController';
import { ActionType } from '@domain/enums/ActionType';

describe('ExecutionController', () => {
    it('queues and consumes action overrides exactly once', () => {
        const controller = new ExecutionController();
        const action = {
            type: ActionType.MOUSE_CLICK_LEFT as const,
            x: 10,
            y: 20,
            thought: 'override action'
        };

        controller.queueActionOverride(action);

        expect(controller.consumeActionOverride()).toEqual(action);
        expect(controller.consumeActionOverride()).toBeUndefined();
    });
});
