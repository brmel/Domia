import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { ClickAction } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class ClickActionHandler implements ActionHandler<ClickAction> {
    readonly actionType = 'click';

    execute(action: ClickAction, browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        return browser.click(action.elementId);
    }
}
