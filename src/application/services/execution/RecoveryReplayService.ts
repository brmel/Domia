import { inject, injectable } from 'tsyringe';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import type { ICheckpointRepository } from '@domain/ports/ICheckpointRepository';

export type ReplayGuardDecision =
    | { readonly decision: 'replay'; readonly idempotencyKey: string }
    | { readonly decision: 'skip'; readonly reason: string }
    | { readonly decision: 'block'; readonly reason: string };

export interface NodeReplayIdempotencyScope {
    readonly runId: string;
    readonly branchId: string;
    readonly nodeId: string;
    readonly actionSignature: string;
}

@injectable()
export class RecoveryReplayService {
    constructor(@inject('ICheckpointRepository') private readonly persistence: ICheckpointRepository) {}

    guardAction(action: AgentAction): ReplayGuardDecision {
        switch (action.type) {
            case ActionType.WAIT:
                return { decision: 'replay', idempotencyKey: `wait:${action.durationMs}` };
            case ActionType.SCROLL:
                return { decision: 'replay', idempotencyKey: `scroll:${action.direction}` };
            case ActionType.MOUSE_MOVE:
                return { decision: 'replay', idempotencyKey: `mouse_move:${action.x}:${action.y}` };
            case ActionType.MOUSE_SCROLL:
                return { decision: 'replay', idempotencyKey: `mouse_scroll:${action.deltaX}:${action.deltaY}` };
            case ActionType.EXTRACT:
                return { decision: 'replay', idempotencyKey: `extract:${String(action.elementId)}` };
            case ActionType.OBSERVE:
                return { decision: 'replay', idempotencyKey: `observe:${String(action.delayMs ?? 0)}` };
            case ActionType.NAVIGATE:
                return { decision: 'replay', idempotencyKey: `navigate:${action.url}` };
            case ActionType.PASS:
            case ActionType.FAIL:
                return { decision: 'skip', reason: `Terminal action '${action.type}' is not replayed` };
            case ActionType.CLICK:
            case ActionType.TYPE:
            case ActionType.PRESS_KEY:
            case ActionType.MOUSE_CLICK_LEFT:
            case ActionType.MOUSE_CLICK_RIGHT:
            case ActionType.MOUSE_DOUBLE_CLICK:
            case ActionType.MOUSE_DRAG:
                return { decision: 'block', reason: `Action '${action.type}' is non-idempotent and blocked for replay` };
            default: {
                const exhaustiveCheck: never = action;
                return { decision: 'block', reason: `Unsupported action for replay: ${String(exhaustiveCheck)}` };
            }
        }
    }

    buildNodeReplayKey(scope: NodeReplayIdempotencyScope): string {
        return `${scope.runId}:${scope.branchId}:${scope.nodeId}:${scope.actionSignature}`;
    }

    async shouldExecute(runId: string, idempotencyKey: string): Promise<boolean> {
        const result = await this.persistence.hasReplayIdempotencyKey(runId, idempotencyKey);
        if (result.isErr()) {
            throw result.error;
        }

        return !result.value;
    }

    async markExecuted(runId: string, idempotencyKey: string): Promise<void> {
        const result = await this.persistence.saveReplayIdempotencyKey(runId, idempotencyKey);
        if (result.isErr()) {
            throw result.error;
        }
    }
}
