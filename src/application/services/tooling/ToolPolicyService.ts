import { injectable } from 'tsyringe';
import { err, ok, type Result } from 'neverthrow';
import type { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolExecutionContext } from './ToolExecutor';

export interface ToolPolicyService {
    beforeToolCall(action: AgentAction, context: ToolExecutionContext): Result<void, Error>;
}

@injectable()
export class DefaultToolPolicyService implements ToolPolicyService {
    beforeToolCall(action: AgentAction, _context: ToolExecutionContext): Result<void, Error> {
        if (
            action.type === ActionType.CLICK
            || action.type === ActionType.TYPE
            || action.type === ActionType.EXTRACT
        ) {
            if (!Number.isFinite(Number(action.elementId))) {
                return err(new Error(`Policy blocked '${action.type}': invalid elementId`));
            }
        }

        switch (action.type) {
            case ActionType.TYPE: {
                if (action.text.trim().length === 0) {
                    return err(new Error("Policy blocked 'type': text must not be empty"));
                }
                break;
            }
            case ActionType.WAIT: {
                if (!Number.isFinite(action.durationMs) || action.durationMs < 0 || action.durationMs > 120_000) {
                    return err(new Error("Policy blocked 'wait': durationMs must be between 0 and 120000"));
                }
                break;
            }
            case ActionType.NAVIGATE: {
                const url = action.url.trim().toLowerCase();
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    return err(new Error("Policy blocked 'navigate': only http/https URLs are allowed"));
                }
                break;
            }
            default:
                break;
        }

        return ok(undefined);
    }
}
