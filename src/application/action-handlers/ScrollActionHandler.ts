import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { ScrollAction } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class ScrollActionHandler implements ActionHandler<ScrollAction> {
    readonly actionType = 'scroll';

    execute(action: ScrollAction, browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        return browser.scroll(action.direction);
    }
}
