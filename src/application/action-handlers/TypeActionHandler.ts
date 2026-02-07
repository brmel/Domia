import { injectable } from 'tsyringe';
import { ResultAsync, okAsync } from 'neverthrow';
import { ActionHandler } from './ActionHandler';
import { TypeAction } from '@domain/value-objects';
import { IBrowserAutomation } from '@domain/ports';
import { InteractionError } from '@domain/errors';

@injectable()
export class TypeActionHandler implements ActionHandler<TypeAction> {
    readonly actionType = 'type';

    execute(action: TypeAction, browser: IBrowserAutomation): ResultAsync<void, InteractionError> {
        return browser.type(action.elementId, action.text)
            .andThen(() => {
                if (action.submit) {
                    return browser.pressKey('Enter')
                        .andThen(() => ResultAsync.fromPromise(
                            new Promise<void>(resolve => setTimeout(resolve, 500)),
                            (e) => new InteractionError(`Wait failed: ${e}`)
                        ));
                }
                return okAsync(undefined);
            });
    }
}
