import { injectable } from 'tsyringe';
import { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';

@injectable()
export class LoopDetectorService {
    isLoop(history: readonly AgentAction[], nextAction: AgentAction): boolean {
        // Simple loop detection: check if the exact same action was performed recently
        // Or if a sequence of actions is repeating.

        // 1. Immediate repetition of same action (e.g. clicking same button twice in a row)
        // unless it's a type action which might be filling multiple fields or same field.
        if (history.length > 0) {
            const lastAction = history[history.length - 1];
            if (lastAction && this.areActionsIdentical(lastAction, nextAction)) {
                // Allow some repetition for scrolling or typing
                if (nextAction.type === ActionType.SCROLL) return false;
                // For clicking, maybe we missed the click? But usually it's a loop.
                return true;
            }
        }

        // 2. Cycle detection (A -> B -> A -> B)
        // Check last 6 actions
        const n = history.length;
        if (n >= 4) {
            // Check for localized cycles of length 2
            const A1 = history[n - 1];
            const B1 = history[n - 2];
            const A2 = history[n - 3];
            const B2 = history[n - 4];

            if (A1 && B1 && A2 && B2 && this.areActionsIdentical(A1, A2) && this.areActionsIdentical(B1, B2)) {
                // Pending action is 'nextAction'. If nextAction == A1, we differ from sequence?
                // No, we are checking if *adding* nextAction continues the loop.
                // Actually, let's just check if history *already* has a loop that nextAction might exacerbate,
                // or if nextAction *completes* a loop.

                // If we have A B A B, and next is A, it's a loop.
                if (this.areActionsIdentical(B1, nextAction)) {
                    return true;
                }
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
