import { ResultAsync } from 'neverthrow';
import { IBrowserAutomation } from '@domain/ports';
import { AgentAction } from '@domain/value-objects';
import { InteractionError } from '@domain/errors';

export interface ActionHandler<T extends AgentAction> {
    readonly actionType: T['type'];
    execute(action: T, browser: IBrowserAutomation): ResultAsync<void, InteractionError>;
}
