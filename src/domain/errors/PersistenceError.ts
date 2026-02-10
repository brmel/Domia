import { DomainError } from './DomainError';

export class PersistenceError extends DomainError {
    readonly code = 'PERSISTENCE_ERROR';

    constructor(message: string, public readonly cause?: unknown) {
        super(message);
    }
}
