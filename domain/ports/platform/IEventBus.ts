import type { DomainEvents, DomainEventName } from '../../events';

export interface IEventBus {
    emit<K extends DomainEventName>(name: K, payload: DomainEvents[K]): void;
    on<K extends DomainEventName>(name: K, handler: (payload: DomainEvents[K]) => void): () => void;
}
