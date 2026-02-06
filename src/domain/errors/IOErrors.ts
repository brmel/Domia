import { DomainError } from './DomainError';

export class InputError extends DomainError {
    readonly code = 'INPUT_ERROR';

    constructor(message: string) {
        super(message);
    }
}

export class OutputError extends DomainError {
    readonly code = 'OUTPUT_ERROR';

    constructor(message: string) {
        super(message);
    }
}
