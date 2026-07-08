import { InMemorySessionService } from '@google/adk';
import type { Event } from '@google/adk';
import type {
    AppendEventRequest,
    CreateSessionRequest,
    GetSessionRequest,
} from '@google/adk';
import type { Session } from '@google/adk';
import type { ILogger, IStorageService } from '@domain/ports';
import { bestEffort } from '@shared/reliability/bestEffort';
import { ADK_SNAPSHOT_PROVIDER } from './adkConstants';

export class PersistentSessionService extends InMemorySessionService {
    constructor(
        private readonly storage: IStorageService,
        private readonly logger: ILogger,
    ) {
        super();
    }

    override async getSession(request: GetSessionRequest): Promise<Session | undefined> {
        const inMemory = await super.getSession(request);
        if (inMemory) return inMemory;
        return this.hydrateFromDisk(request);
    }

    override async appendEvent(request: AppendEventRequest): Promise<Event> {
        const event = await super.appendEvent(request);
        await bestEffort(this.logger, `persist session ${request.session.id}`, () =>
            this.persist(request.session),
        );
        return event;
    }

    private async persist(session: Session): Promise<void> {
        const current = await super.getSession({
            appName: session.appName,
            userId: session.userId,
            sessionId: session.id,
        });
        if (!current) return;
        await this.storage.saveConversationSnapshot(session.id, {
            providerKind: ADK_SNAPSHOT_PROVIDER,
            capturedAt: Date.now(),
            events: current.events,
        });
    }

    private async hydrateFromDisk(request: GetSessionRequest): Promise<Session | undefined> {
        const snapshot = await this.loadSnapshot(request.sessionId);
        if (!snapshot || snapshot.providerKind !== ADK_SNAPSHOT_PROVIDER) return undefined;
        const events = snapshot.events as Event[];
        if (!Array.isArray(events) || events.length === 0) return undefined;

        const createRequest: CreateSessionRequest = {
            appName: request.appName,
            userId: request.userId,
            sessionId: request.sessionId,
        };
        const session = await super.createSession(createRequest);
        for (const event of events) {
            await super.appendEvent({ session, event });
        }
        this.logger.info(`[PersistentSessionService] Rehydrated session ${request.sessionId} from disk (${events.length} events)`);
        return super.getSession(request);
    }

    private async loadSnapshot(sessionId: string): Promise<import('@domain/value-objects/ConversationSnapshot').ConversationSnapshot | null> {
        try {
            return await this.storage.loadConversationSnapshotForRun(sessionId);
        } catch (error) {
            this.logger.warn(`[PersistentSessionService] Failed to load snapshot for ${sessionId}: ${String(error)}`);
            return null;
        }
    }
}
