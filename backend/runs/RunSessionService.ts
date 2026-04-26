import { inject, injectable } from 'tsyringe';
import type { RunInput } from '@backend/dto';
import type { ILogger, IStructuredAutomation } from '@domain/ports';
import { SessionError } from '@domain/errors';
import { PlatformSessionFactory } from '@backend/platform/PlatformSessionFactory';
import type { PlatformSession } from '@backend/platform/PlatformSession';

export interface RunExecutionContext {
    readonly session?: PlatformSession;
    readonly shouldNavigate?: boolean;
    readonly disposeSessionOnComplete?: boolean;
}

export interface PreparedRunSession {
    readonly automation: IStructuredAutomation;
    readonly disposeSession?: () => Promise<void>;
    readonly shouldNavigate: boolean;
    readonly ownsSession: boolean;
    readonly sessionExtras?: Readonly<Record<string, unknown>>;
}

@injectable()
export class RunSessionService {
    constructor(
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async prepare(input: RunInput, runContext?: RunExecutionContext): Promise<PreparedRunSession> {
        let disposeSession: (() => Promise<void>) | undefined;
        let ownsSession = false;

        try {
            const session = runContext?.session ?? await this.sessionFactory.createSession(input);
            disposeSession = session.dispose;
            ownsSession = runContext?.session
                ? (runContext.disposeSessionOnComplete ?? false)
                : true;

            return {
                automation: session.automation,
                disposeSession,
                shouldNavigate: runContext?.shouldNavigate ?? session.shouldNavigate,
                ownsSession,
                ...(session.extras ? { sessionExtras: session.extras } : {}),
            };
        } catch (error) {
            if (disposeSession && ownsSession) {
                await disposeSession().catch(() => undefined);
            }

            const message = error instanceof Error ? error.message : String(error);
            throw new SessionError(`${message}`);
        }
    }

    async dispose(prepared: PreparedRunSession): Promise<void> {
        if (!prepared.disposeSession || !prepared.ownsSession) return;

        await prepared.disposeSession().catch((error) => {
            this.logger.warn(`[RunSessionService] Error during session cleanup: ${String(error)}`);
        });
    }
}
