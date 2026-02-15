import { DomainError } from './DomainError';

export class LLMError extends DomainError {
    readonly code = 'LLM_ERROR';

    constructor(
        message: string,
        readonly provider?: string,
    ) {
        super(message);
    }
}
