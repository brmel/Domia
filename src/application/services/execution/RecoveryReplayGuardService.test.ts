import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import { ElementIdFactory } from '@domain/value-objects';
import { RecoveryReplayGuardService } from './RecoveryReplayGuardService';

describe('RecoveryReplayGuardService', () => {
    const service = new RecoveryReplayGuardService();

    it('allows replay for idempotent action classes', () => {
        const actions: AgentAction[] = [
            { type: ActionType.WAIT, durationMs: 300, thought: 'wait' },
            { type: ActionType.SCROLL, direction: 'down', thought: 'scroll' },
            { type: ActionType.MOUSE_MOVE, x: 10, y: 20, thought: 'move' },
            { type: ActionType.MOUSE_SCROLL, deltaX: 0, deltaY: 300, thought: 'wheel' },
            { type: ActionType.EXTRACT, elementId: ElementIdFactory.unsafe(1), thought: 'extract' },
            { type: ActionType.NAVIGATE, url: 'https://example.com', thought: 'navigate' }
        ];

        for (const action of actions) {
            const decision = service.decide(action);
            expect(decision.decision).toBe('replay');
        }
    });

    it('blocks non-idempotent action classes', () => {
        const actions: AgentAction[] = [
            { type: ActionType.CLICK, elementId: ElementIdFactory.unsafe(2), thought: 'click' },
            { type: ActionType.TYPE, elementId: ElementIdFactory.unsafe(3), text: 'abc', thought: 'type' },
            { type: ActionType.MOUSE_CLICK_LEFT, x: 10, y: 20, thought: 'left click' },
            { type: ActionType.MOUSE_CLICK_RIGHT, x: 10, y: 20, thought: 'right click' },
            { type: ActionType.MOUSE_DOUBLE_CLICK, x: 10, y: 20, thought: 'double click' },
            { type: ActionType.MOUSE_DRAG, fromX: 5, fromY: 5, toX: 40, toY: 40, thought: 'drag' },
            { type: ActionType.PRESS_KEY, key: 'Enter', thought: 'press' }
        ];

        for (const action of actions) {
            const decision = service.decide(action);
            expect(decision.decision).toBe('block');
        }
    });

    it('skips terminal actions', () => {
        const passDecision = service.decide({ type: ActionType.PASS, summary: 'ok' });
        const failDecision = service.decide({ type: ActionType.FAIL, reason: 'bad' });

        expect(passDecision.decision).toBe('skip');
        expect(failDecision.decision).toBe('skip');
    });
});
