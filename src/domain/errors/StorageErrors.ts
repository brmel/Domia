import { DomainError } from './DomainError';

export class StorageError extends DomainError {
    readonly code = 'STORAGE_ERROR';

    constructor(message: string) {
        super(message);
    }
}

export class NotFoundError extends DomainError {
    readonly code = 'NOT_FOUND_ERROR';

    constructor(
        entityType: string,
        readonly id: string,
    ) {
        super(`${entityType} with id '${id}' not found`);
    }
}
