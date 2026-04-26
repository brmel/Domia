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

export class ReadinessError extends DomainError {
    readonly code = 'READINESS_BLOCKED';
    constructor(message: string) { super(message); }
}

export class BudgetExceededError extends DomainError {
    readonly code = 'BUDGET_EXCEEDED';
    constructor(message: string) { super(message); }
}

export class SessionError extends DomainError {
    readonly code = 'SESSION_ERROR';
    constructor(message: string, cause?: unknown) { super(message, cause); }
}
