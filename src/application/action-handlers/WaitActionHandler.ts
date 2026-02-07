import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { WaitAction } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class WaitActionHandler implements ActionHandler<WaitAction> {
    readonly actionType = 'wait';

    execute(action: WaitAction, browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        return browser.wait(action.durationMs);
    }
}
