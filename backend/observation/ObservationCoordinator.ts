import type { IObservationStream, FrameHandler, FrameSubscription } from '@domain/ports/perception/IObservationStream';
import type { IObservationSampler } from '@domain/ports/perception/IObservationSampler';
import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { RunId } from '@domain/value-objects';
import { ObservationProfile } from '@domain/value-objects/ObservationProfile';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { IObservationCoordinator } from '@domain/ports/perception/IObservationCoordinator';
import { ObservationRingBuffer } from './ObservationRingBuffer';

const LOG_TAG = '[ObservationCoordinator]';

export interface ObservationCoordinatorDeps {
    readonly runId: RunId;
    readonly sampler: IObservationSampler;
    readonly stream: IObservationStream;
    readonly events: IEventBus;
    readonly logger: ILogger;
    readonly initialProfile: ObservationProfile;
}

export class ObservationCoordinator implements IObservationCoordinator {
    private readonly buffer = new ObservationRingBuffer();
    private profile: ObservationProfile;
    private subscription: FrameSubscription | null = null;
    private started = false;

    constructor(private readonly deps: ObservationCoordinatorDeps) {
        this.profile = deps.initialProfile;
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        if (this.isStreamingProfile(this.profile)) {
            await this.deps.stream.start(this.deps.runId, this.profile);
            this.subscription = this.deps.stream.subscribe(this.deps.runId, this.handleFrame);
        }
        this.deps.logger.debug(`${LOG_TAG} started runId=${this.deps.runId} profile=${this.profile}`);
    }

    async stop(): Promise<void> {
        if (!this.started) return;
        this.subscription?.unsubscribe();
        this.subscription = null;
        if (this.deps.stream.isRunning(this.deps.runId)) {
            await this.deps.stream.stop(this.deps.runId);
        }
        this.buffer.clear();
        this.started = false;
        this.deps.logger.debug(`${LOG_TAG} stopped runId=${this.deps.runId}`);
    }

    async setProfile(profile: ObservationProfile): Promise<void> {
        if (profile === this.profile) return;
        const previous = this.profile;
        this.profile = profile;

        const wasStreaming = this.isStreamingProfile(previous);
        const isStreaming = this.isStreamingProfile(profile);

        if (wasStreaming && !isStreaming) {
            this.subscription?.unsubscribe();
            this.subscription = null;
            await this.deps.stream.stop(this.deps.runId);
        } else if (!wasStreaming && isStreaming) {
            await this.deps.stream.start(this.deps.runId, profile);
            this.subscription = this.deps.stream.subscribe(this.deps.runId, this.handleFrame);
        } else if (isStreaming) {
            await this.deps.stream.setProfile(this.deps.runId, profile);
        }

        this.deps.events.emit('observation.profile_changed', { runId: this.deps.runId, profile, previous });
        this.deps.logger.info(`${LOG_TAG} runId=${this.deps.runId} profile ${previous} → ${profile}`);
    }

    async sample(hint?: string): Promise<ObservationFrame> {
        const frame = await this.deps.sampler.sample({ runId: this.deps.runId, ...(hint ? { hint } : {}) });
        this.buffer.push(frame);
        this.deps.events.emit('observation.frame', { frame });
        return frame;
    }

    recent(sinceMs: number): readonly ObservationFrame[] {
        return this.buffer.sinceMs(sinceMs);
    }

    subscribeToStream(handler: FrameHandler): FrameSubscription {
        if (!this.deps.stream.isRunning(this.deps.runId)) {
            return { unsubscribe: () => undefined };
        }
        return this.deps.stream.subscribe(this.deps.runId, handler);
    }

    currentProfile(): ObservationProfile {
        return this.profile;
    }

    private readonly handleFrame: FrameHandler = (frame) => {
        this.buffer.push(frame);
        this.deps.events.emit('observation.frame', { frame });
    };

    private isStreamingProfile(profile: ObservationProfile): boolean {
        return profile !== ObservationProfile.Off && profile !== ObservationProfile.OnDemand;
    }
}
