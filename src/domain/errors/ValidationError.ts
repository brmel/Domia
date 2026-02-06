import { DomainError } from './DomainError';

export class ValidationError extends DomainError {
    readonly code = 'VALIDATION_ERROR';

    constructor(
        message: string,
        readonly field?: string,
    ) {
        super(message);
    }
}
