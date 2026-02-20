import { injectable } from 'tsyringe';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import type { DOMSnapshot } from '@domain/value-objects/DOMSnapshot';
import { LoopDetectorService } from './LoopDetectorService';

@injectable()
export class ExecutionHeuristicsService {
    buildSnapshotSignature(snapshot: DOMSnapshot, currentUrl: string): string {
        const topElements = snapshot.elements
            .slice(0, 25)
            .map((element) => `${element.tag}:${(element.role ?? '').toLowerCase()}:${this.normalizeForSignature(element.text).slice(0, 48)}`)
            .join('|');

        return [
            this.normalizeForSignature(currentUrl),
            this.normalizeForSignature(snapshot.title),
            String(snapshot.elements.length),
            topElements
        ].join('::');
    }

    isInteractionLikelyInFlight(history: readonly AgentAction[]): boolean {
        const lastAction = history[history.length - 1];
        if (!lastAction) {
            return false;
        }

        return lastAction.type === ActionType.CLICK
            || lastAction.type === ActionType.TYPE
            || lastAction.type === ActionType.PRESS_KEY
            || lastAction.type === ActionType.MOUSE_CLICK_LEFT
            || lastAction.type === ActionType.MOUSE_DOUBLE_CLICK
            || lastAction.type === ActionType.MOUSE_DRAG;
    }

    buildLoopAdvice(action: AgentAction, isBlocked: boolean): string {
        const prefix = isBlocked
            ? `Action '${action.type}' was already detected as ineffective. Do not repeat it.`
            : action.type === ActionType.CLICK
                ? 'Loop detected on repeated click attempts. Do not repeat the same click.'
                : `Loop detected on repeated '${action.type}' attempts.`;

        return `${prefix} Choose a different strategy (for example extract evidence or navigate to a clearer state) before retrying.`;
    }

    resolveActionSignature(action: AgentAction, loopDetector: LoopDetectorService): string {
        return loopDetector.getActionSignature(action);
    }

    private normalizeForSignature(input: string): string {
        return input.toLowerCase().replace(/\s+/g, ' ').trim();
    }
}
