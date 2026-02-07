import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { NavigateAction, Url } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class NavigateActionHandler implements ActionHandler<NavigateAction> {
    readonly actionType = 'navigate';

    execute(action: NavigateAction, browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        // Cast string to Url branded type, assuming browser adapter handles validation or throws
        return browser.navigateTo(action.url as Url)
            .mapErr(e => new InteractionError(`Navigation failed: ${e.message}`));
    }
}
