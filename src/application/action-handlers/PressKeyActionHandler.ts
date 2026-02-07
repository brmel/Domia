import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { PressKeyAction } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class PressKeyActionHandler implements ActionHandler<PressKeyAction> {
    readonly actionType = 'pressKey';

    execute(action: PressKeyAction, browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        return browser.pressKey(action.key);
    }
}
