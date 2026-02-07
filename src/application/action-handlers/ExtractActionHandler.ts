import { injectable } from 'tsyringe';
import { ResultAsync, okAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { ExtractAction } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class ExtractActionHandler implements ActionHandler<ExtractAction> {
    readonly actionType = 'extract';

    execute(_action: ExtractAction, _browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        // Extract action is primarily for the agent to signal it found data.
        // The data is captured in the action object wrapper in the use case.
        // We can just return ok here, or if we had a data collector service we would call it.
        // For now, it's a no-op on the browser side.
        return okAsync(undefined);
    }
}
