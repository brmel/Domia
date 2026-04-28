import type { AgentOutcome } from '@domain/ports/IAgentRuntime';

export function isOutcomeSuccessful(outcome: AgentOutcome): boolean {
    if (outcome.kind === 'error') return false;
    if (outcome.kind === 'stopped') return false;
    return outcome.output.verdict !== 'fail';
}

export function summarizeOutcome(outcome: AgentOutcome): string {
    switch (outcome.kind) {
        case 'done':
            return outcome.output.summary || 'Completed.';
        case 'stopped':
            return outcome.summary || `Stopped: ${outcome.reason}`;
        case 'error':
            return outcome.cause.message;
    }
}
