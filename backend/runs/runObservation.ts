import { ObservationCoordinator } from '@backend/observation/ObservationCoordinator';
import type { ObservationProfile, RunId } from '@domain/value-objects';
import type { IPerceptionPipeline, ILogger } from '@domain/ports';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { PreparedRunSession } from './RunSessionService';

export interface RunObservationDeps {
    readonly runId: RunId;
    readonly preparedSession: PreparedRunSession;
    readonly perception: IPerceptionPipeline;
    readonly events: IEventBus;
    readonly logger: ILogger;
    readonly vision: boolean;
    readonly initialProfile: ObservationProfile;
}

/**
 * Single construction site for a run's ObservationCoordinator. Both RunUseCase and
 * RunResumeService open observation the same way — wiring the prepared session's
 * sampler/stream to the event bus + logger — so it lives here instead of being
 * `new`'d inline in two places.
 */
export function createRunObservationCoordinator(deps: RunObservationDeps): ObservationCoordinator {
    return new ObservationCoordinator({
        runId: deps.runId,
        sampler: deps.preparedSession.createObservationSampler({ perception: deps.perception, vision: deps.vision }),
        stream: deps.preparedSession.createObservationStream(),
        events: deps.events,
        logger: deps.logger,
        initialProfile: deps.initialProfile,
    });
}
