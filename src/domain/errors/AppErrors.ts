import { DomainError } from './DomainError';

export class NavigationError extends DomainError {
    readonly code = 'NAVIGATION_ERROR';

    constructor(message: string) {
        super(message);
    }
}

export class InteractionError extends DomainError {
    readonly code = 'INTERACTION_ERROR';

    constructor(
        message: string,
        readonly ref?: string,
    ) {
        super(message);
    }
}

export class SnapshotError extends DomainError {
    readonly code = 'SNAPSHOT_ERROR';

    constructor(message: string) {
        super(message);
    }
}
