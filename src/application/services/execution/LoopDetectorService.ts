import { injectable } from 'tsyringe';
import { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';

@injectable()
export class LoopDetectorService {
    isLoop(history: readonly AgentAction[], nextAction: AgentAction): boolean {
        // Check for immediate repetition (allow 1 retry)
        // Fail if we see A -> A -> A (current is 3rd A)
        if (history.length >= 2) {
            const lastAction = history[history.length - 1];
            const secondLastAction = history[history.length - 2];

            if (lastAction && secondLastAction &&
                this.areActionsIdentical(lastAction, nextAction) &&
                this.areActionsIdentical(secondLastAction, nextAction)) {

                // Exempt harmless actions like SCROLL or WAIT if needed, but usually 3x is a loop
                if (nextAction.type === ActionType.SCROLL) return false;
                if (nextAction.type === ActionType.WAIT) return false;

                return true;
            }
        }

        // Check for cycles (e.g. A -> B -> A -> B)
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
        if (a1.type !== a2.type) return false;

        switch (a1.type) {
            case ActionType.CLICK: {
                const b = a2 as Extract<AgentAction, { type: ActionType.CLICK }>;
                const a = a1 as Extract<AgentAction, { type: ActionType.CLICK }>;
                return b.elementId === a.elementId;
            }
            case ActionType.TYPE: {
                const b = a2 as Extract<AgentAction, { type: ActionType.TYPE }>;
                const a = a1 as Extract<AgentAction, { type: ActionType.TYPE }>;
                return b.elementId === a.elementId && b.text === a.text;
            }
            case ActionType.NAVIGATE: {
                const b = a2 as Extract<AgentAction, { type: ActionType.NAVIGATE }>;
                const a = a1 as Extract<AgentAction, { type: ActionType.NAVIGATE }>;
                return b.url === a.url;
            }
            case ActionType.SCROLL: {
                const b = a2 as Extract<AgentAction, { type: ActionType.SCROLL }>;
                const a = a1 as Extract<AgentAction, { type: ActionType.SCROLL }>;
                return b.direction === a.direction;
            }
            default:
                return JSON.stringify(a1) === JSON.stringify(a2);
        }
    }
}
