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

export class ParseError extends DomainError {
    readonly code = 'PARSE_ERROR';

    constructor(
        message: string,
        readonly rawResponse?: string,
    ) {
        super(message);
    }
}
