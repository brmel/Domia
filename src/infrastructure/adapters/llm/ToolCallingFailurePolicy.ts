import { injectable } from 'tsyringe';
import type { ToolCallingFailure } from '@domain/ports';

export type ToolCallingFailureAction =
    | { readonly type: 'retry'; readonly reason: string }
    | { readonly type: 'retry_with_correction'; readonly reason: string }
    | { readonly type: 'fail'; readonly reason: string };

@injectable()
export class ToolCallingFailurePolicy {
    resolve(failure: ToolCallingFailure, attempt: number, maxAttempts: number): ToolCallingFailureAction {
        if (!failure.recoverable || attempt >= maxAttempts) {
            return {
                type: 'fail',
                reason: this.describeFailure(failure)
            };
        }

        if (!failure.retryable) {
            return {
                type: 'fail',
                reason: this.describeFailure(failure)
            };
        }

        if (failure.code === 'invalid_tool_args' || failure.code === 'unknown_tool' || failure.code === 'invalid_tool_name') {
            return {
                type: 'retry_with_correction',
                reason: this.describeFailure(failure)
            };
        }

        return {
            type: 'retry',
            reason: this.describeFailure(failure)
        };
    }

    private describeFailure(failure: ToolCallingFailure): string {
        return `Tool calling failure [${failure.code}] ${failure.message}`;
    }
}
