import type { AgentOutcome, AgentVerdict } from '@domain/ports/agent/IAgentRuntime';

export interface FinalizeDescriptor {
    readonly summary?: string;
    readonly handlerKey: AgentVerdict | 'finish';
    readonly value?: unknown;
}

export function describeForFinalize(outcome: AgentOutcome | undefined): FinalizeDescriptor {
    if (outcome?.kind === 'done') {
        return {
            handlerKey: outcome.output.verdict ?? 'finish',
            ...(outcome.output.summary ? { summary: outcome.output.summary } : {}),
            ...(outcome.output.value !== undefined ? { value: outcome.output.value } : {}),
        };
    }
    if (outcome?.kind === 'iterate') {
        return { handlerKey: 'finish', ...(outcome.summary ? { summary: outcome.summary } : {}) };
    }
    return { handlerKey: 'fail' };
}

export function isOutcomeSuccessful(outcome: AgentOutcome): boolean {
    if (outcome.kind === 'error') return false;
    if (outcome.kind === 'stopped') return false;
    if (outcome.kind === 'iterate') return true;
    return outcome.output.verdict !== 'fail';
}

export function summarizeOutcome(outcome: AgentOutcome): string {
    switch (outcome.kind) {
        case 'done':
            return outcome.output.summary || 'Completed.';
        case 'iterate':
            return outcome.summary || 'Iterating.';
        case 'stopped':
            return outcome.summary || `Stopped: ${outcome.reason}`;
        case 'error':
            return outcome.cause.message;
    }
}
