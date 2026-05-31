import type { IObservationStream, ObservationStreamHandle, FrameHandler, FrameSubscription } from '@domain/ports/perception/IObservationStream';
import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { RunId } from '@domain/value-objects';
import type { ObservationProfile } from '@domain/value-objects/ObservationProfile';

export class AppiumStream implements IObservationStream {
    private readonly running = new Map<string, { profile: ObservationProfile; handlers: Set<FrameHandler> }>();

    async start(runId: RunId, profile: ObservationProfile): Promise<ObservationStreamHandle> {
        if (this.running.has(runId)) throw new Error(`Stream already running for runId=${runId}`);
        this.running.set(runId, { profile, handlers: new Set() });
        return { runId, profile, startedAt: Date.now() };
    }

    async setProfile(runId: RunId, profile: ObservationProfile): Promise<void> {
        const state = this.running.get(runId);
        if (!state) throw new Error(`No active stream for runId=${runId}`);
        state.profile = profile;
    }

    async stop(runId: RunId): Promise<void> {
        this.running.delete(runId);
    }

    subscribe(runId: RunId, handler: FrameHandler): FrameSubscription {
        const state = this.running.get(runId);
        if (!state) throw new Error(`No active stream for runId=${runId}`);
        state.handlers.add(handler);
        return { unsubscribe: () => state.handlers.delete(handler) };
    }

    recent(): readonly ObservationFrame[] {
        return [];
    }

    isRunning(runId: RunId): boolean {
        return this.running.has(runId);
    }
}
