
import { DomainError } from './DomainError';

export class WorkflowError extends DomainError {
    readonly code = 'WORKFLOW_ERROR';

    constructor(
        message: string,
        readonly cause?: unknown,
    ) {
        super(message);
    }
}
