import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { ObservationProfile } from '@domain/value-objects/ObservationProfile';
import type { FrameHandler, FrameSubscription } from '@domain/ports/IObservationStream';

/**
 * WHY: the observation coordinator is a backend orchestrator, but it is consumed
 * by tools + the agent-runtime adapter (infrastructure) through `AgentInput.extras`.
 * This domain port is the contract those infra consumers depend on, so they never
 * import the concrete backend class. Implemented by ObservationCoordinator.
 */
export interface IObservationCoordinator {
    setProfile(profile: ObservationProfile): Promise<void>;
    currentProfile(): ObservationProfile;
    recent(sinceMs: number): readonly ObservationFrame[];
    subscribeToStream(handler: FrameHandler): FrameSubscription;
}
