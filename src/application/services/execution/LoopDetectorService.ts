import { injectable } from 'tsyringe';
import { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';

@injectable()
export class LoopDetectorService {
    getActionSignature(action: AgentAction): string {
        switch (action.type) {
            case ActionType.CLICK:
                return `click:${String(action.elementId)}`;
            case ActionType.TYPE:
                return `type:${String(action.elementId)}:${action.text}`;
            case ActionType.NAVIGATE:
                return `navigate:${action.url}`;
            case ActionType.SCROLL:
                return `scroll:${action.direction}`;
            case ActionType.EXTRACT:
                return `extract:${String(action.elementId)}`;
            case ActionType.MOUSE_MOVE:
                return `mouse_move:${action.x}:${action.y}`;
            case ActionType.MOUSE_CLICK_LEFT:
                return `mouse_click_left:${action.x}:${action.y}`;
            case ActionType.MOUSE_CLICK_RIGHT:
                return `mouse_click_right:${action.x}:${action.y}`;
            case ActionType.MOUSE_DOUBLE_CLICK:
                return `mouse_double_click:${action.x}:${action.y}`;
            case ActionType.MOUSE_DRAG:
                return `mouse_drag:${action.fromX}:${action.fromY}:${action.toX}:${action.toY}:${action.steps ?? 0}`;
            case ActionType.MOUSE_SCROLL:
                return `mouse_scroll:${action.deltaX}:${action.deltaY}`;
            case ActionType.WAIT:
                return `wait:${action.durationMs}`;
            case ActionType.PRESS_KEY:
                return `press_key:${action.key}`;
            case ActionType.PASS:
                return 'pass';
            case ActionType.FAIL:
                return 'fail';
            default: {
                const exhaustiveCheck: never = action;
                return exhaustiveCheck;
            }
        }
    }

    isLoop(history: readonly AgentAction[], nextAction: AgentAction): boolean {
        if (history.length >= 2) {
            const lastAction = history[history.length - 1];
            const secondLastAction = history[history.length - 2];

            if (lastAction && secondLastAction &&
                this.areActionsIdentical(lastAction, nextAction) &&
                this.areActionsIdentical(secondLastAction, nextAction)) {

                if (nextAction.type === ActionType.SCROLL) return false;
                if (nextAction.type === ActionType.WAIT) return false;

                return true;
            }
        }

        const n = history.length;
        if (n >= 4) {
            const [A1, B1, A2, B2] = [history[n - 1], history[n - 2], history[n - 3], history[n - 4]];
            if (A1 && B1 && A2 && B2 && this.areActionsIdentical(A1, A2) && this.areActionsIdentical(B1, B2)) {
                if (this.areActionsIdentical(B1, nextAction)) return true;
            }
        }

        return false;
    }

    private areActionsIdentical(a1: AgentAction, a2: AgentAction): boolean {
        return this.getActionSignature(a1) === this.getActionSignature(a2);
    }
}
