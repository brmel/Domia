export abstract class DomainError extends Error {
    abstract readonly code: string;

    constructor(message: string, readonly cause?: unknown) {
        super(message);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class ValidationError extends DomainError {
    readonly code = 'VALIDATION_ERROR';
    constructor(message: string, readonly field?: string) { super(message); }
}

export class PersistenceError extends DomainError {
    readonly code = 'PERSISTENCE_ERROR';
    constructor(message: string, cause?: unknown) { super(message, cause); }
}

export class WorkflowError extends DomainError {
    readonly code = 'WORKFLOW_ERROR';
    constructor(message: string, cause?: unknown) { super(message, cause); }
}

export class NavigationError extends DomainError {
    readonly code = 'NAVIGATION_ERROR';
    constructor(message: string) { super(message); }
}

export class InteractionError extends DomainError {
    readonly code = 'INTERACTION_ERROR';
    constructor(message: string, readonly ref?: string) { super(message); }
}

export class SnapshotError extends DomainError {
    readonly code = 'SNAPSHOT_ERROR';
    constructor(message: string) { super(message); }
}

export class SessionError extends DomainError {
    readonly code = 'SESSION_ERROR';
    constructor(message: string, cause?: unknown) { super(message, cause); }
}

/**
 * Provider-neutral LLM error taxonomy (W13). Adapters classify SDK/transport
 * errors into these so the retry boundary decides retry-vs-surface from the typed
 * `retryable` flag with zero provider knowledge.
 */
export abstract class LlmError extends DomainError {
    abstract readonly retryable: boolean;
}

export class LlmRateLimitError extends LlmError {
    readonly code = 'LLM_RATE_LIMIT';
    readonly retryable = true;
    constructor(message: string, cause?: unknown) { super(message, cause); }
}

export class LlmServerError extends LlmError {
    readonly code = 'LLM_SERVER_ERROR';
    readonly retryable = true;
    constructor(message: string, cause?: unknown) { super(message, cause); }
}

export class LlmAuthError extends LlmError {
    readonly code = 'LLM_AUTH_ERROR';
    readonly retryable = false;
    constructor(message: string, cause?: unknown) { super(message, cause); }
}

export class LlmBadRequestError extends LlmError {
    readonly code = 'LLM_BAD_REQUEST';
    readonly retryable = false;
    constructor(message: string, cause?: unknown) { super(message, cause); }
}
