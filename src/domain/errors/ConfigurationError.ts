import { DomainError } from './DomainError';

export class ConfigurationError extends DomainError {
    readonly code = 'CONFIGURATION_ERROR';

    constructor(message: string) {
        super(message);
    }
}
