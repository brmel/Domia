import { inject, injectable } from 'tsyringe';
import type { IObservationStream, FrameHandler, FrameSubscription } from '@domain/ports/IObservationStream';
import type { IObservationSampler } from '@domain/ports/IObservationSampler';
import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { RunId } from '@domain/value-objects';
import { ObservationProfile } from '@domain/value-objects/ObservationProfile';
import type { IEventBus } from '@domain/ports/IEventBus';
import type { ILogger } from '@domain/ports';
import { ObservationRingBuffer } from './ObservationRingBuffer';

const LOG_TAG = '[ObservationCoordinator]';

interface RunSession {
    readonly runId: RunId;
    profile: ObservationProfile;
    readonly buffer: ObservationRingBuffer;
    readonly subscription: FrameSubscription | null;
}

@injectable()
export class ObservationCoordinator {
    private readonly sessions = new Map<string, RunSession>();

    constructor(
        @inject('IObservationSampler') private readonly sampler: IObservationSampler,
        @inject('IObservationStream') private readonly stream: IObservationStream,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async start(runId: RunId, profile: ObservationProfile): Promise<void> {
        if (this.sessions.has(runId)) {
            await this.setProfile(runId, profile);
            return;
        }
        const buffer = new ObservationRingBuffer();
        let subscription: FrameSubscription | null = null;
        if (profile !== ObservationProfile.Off && profile !== ObservationProfile.OnDemand) {
            await this.stream.start(runId, profile);
            subscription = this.stream.subscribe(runId, this.frameHandler(buffer));
        }
        this.sessions.set(runId, { runId, profile, buffer, subscription });
        this.logger.debug(`${LOG_TAG} started runId=${runId} profile=${profile}`);
    }

    async stop(runId: RunId): Promise<void> {
        const session = this.sessions.get(runId);
        if (!session) return;
        session.subscription?.unsubscribe();
        if (this.stream.isRunning(runId)) await this.stream.stop(runId);
        session.buffer.clear();
        this.sessions.delete(runId);
        this.logger.debug(`${LOG_TAG} stopped runId=${runId}`);
    }

    async setProfile(runId: RunId, profile: ObservationProfile): Promise<void> {
        const session = this.sessions.get(runId);
        if (!session) {
            await this.start(runId, profile);
            return;
        }
        if (session.profile === profile) return;
        const previous = session.profile;
        session.profile = profile;

        const wasStreaming = previous !== ObservationProfile.Off && previous !== ObservationProfile.OnDemand;
        const isStreaming = profile !== ObservationProfile.Off && profile !== ObservationProfile.OnDemand;

        if (wasStreaming && !isStreaming) {
            session.subscription?.unsubscribe();
            await this.stream.stop(runId);
        } else if (!wasStreaming && isStreaming) {
            await this.stream.start(runId, profile);
            (session as { subscription: FrameSubscription | null }).subscription = this.stream.subscribe(runId, this.frameHandler(session.buffer));
        } else if (isStreaming) {
            await this.stream.setProfile(runId, profile);
        }

        this.events.emit('observation.profile_changed', { runId, profile, previous });
        this.logger.info(`${LOG_TAG} runId=${runId} profile ${previous} → ${profile}`);
    }

    async sample(runId: RunId, hint?: string): Promise<ObservationFrame> {
        const frame = await this.sampler.sample({ runId, ...(hint ? { hint } : {}) });
        const session = this.sessions.get(runId);
        if (session) session.buffer.push(frame);
        this.events.emit('observation.frame', { frame });
        return frame;
    }

    recent(runId: RunId, sinceMs: number): readonly ObservationFrame[] {
        const session = this.sessions.get(runId);
        return session ? session.buffer.sinceMs(sinceMs) : [];
    }

    profile(runId: RunId): ObservationProfile | undefined {
        return this.sessions.get(runId)?.profile;
    }

    subscribe(runId: RunId, handler: FrameHandler): FrameSubscription {
        return this.stream.subscribe(runId, handler);
    }

    private frameHandler(buffer: ObservationRingBuffer): FrameHandler {
        return (frame) => {
            buffer.push(frame);
            this.events.emit('observation.frame', { frame });
        };
    }
}
