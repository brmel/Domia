import { injectable } from 'tsyringe';
import mitt, { type Emitter } from 'mitt';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { DomainEvents, DomainEventName } from '@domain/events';

@injectable()
export class EventBus implements IEventBus {
    private readonly emitter: Emitter<Record<string, unknown>> = mitt<Record<string, unknown>>();

    emit<K extends DomainEventName>(name: K, payload: DomainEvents[K]): void {
        this.emitter.emit(name, payload);
    }

    on<K extends DomainEventName>(name: K, handler: (payload: DomainEvents[K]) => void): () => void {
        const wrapped = (p: unknown) => handler(p as DomainEvents[K]);
        this.emitter.on(name, wrapped);
        return () => this.emitter.off(name, wrapped);
    }
}
