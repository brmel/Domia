import { injectable, inject } from 'tsyringe';
import { ActionHandler } from './ActionHandler';
import { AgentAction } from '@domain/value-objects';
import { ClickActionHandler } from './ClickActionHandler';
import { TypeActionHandler } from './TypeActionHandler';
import { PressKeyActionHandler } from './PressKeyActionHandler';
import { ScrollActionHandler } from './ScrollActionHandler';
import { WaitActionHandler } from './WaitActionHandler';
import { ExtractActionHandler } from './ExtractActionHandler';

@injectable()
export class ActionHandlerRegistry {
    private handlers = new Map<string, ActionHandler<any>>();

    constructor(
        @inject(ClickActionHandler) clickHandler: ClickActionHandler,
        @inject(TypeActionHandler) typeHandler: TypeActionHandler,
        @inject(PressKeyActionHandler) pressKeyHandler: PressKeyActionHandler,
        @inject(ScrollActionHandler) scrollHandler: ScrollActionHandler,
        @inject(WaitActionHandler) waitHandler: WaitActionHandler,
        @inject(ExtractActionHandler) extractHandler: ExtractActionHandler
    ) {
        this.register(clickHandler);
        this.register(typeHandler);
        this.register(pressKeyHandler);
        this.register(scrollHandler);
        this.register(waitHandler);
        this.register(extractHandler);
    }

    register(handler: ActionHandler<any>) {
        this.handlers.set(handler.actionType, handler);
    }

    get<T extends AgentAction>(type: T['type']): ActionHandler<T> | undefined {
        return this.handlers.get(type) as ActionHandler<T> | undefined;
    }
}
