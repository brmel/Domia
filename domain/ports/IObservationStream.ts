import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { ObservationProfile } from '@domain/value-objects/ObservationProfile';
import type { RunId } from '@domain/value-objects';

export interface ObservationStreamHandle {
    readonly runId: RunId;
    readonly profile: ObservationProfile;
    readonly startedAt: number;
}

export type FrameHandler = (frame: ObservationFrame) => void;

export interface FrameSubscription {
    unsubscribe(): void;
}

export interface IObservationStream {
    start(runId: RunId, profile: ObservationProfile): Promise<ObservationStreamHandle>;
    stop(runId: RunId): Promise<void>;
    setProfile(runId: RunId, profile: ObservationProfile): Promise<void>;
    subscribe(runId: RunId, handler: FrameHandler): FrameSubscription;
    recent(runId: RunId, sinceMs: number): readonly ObservationFrame[];
    isRunning(runId: RunId): boolean;
}
