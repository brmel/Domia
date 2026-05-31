import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { RunId } from '@domain/value-objects';

export interface SampleRequest {
    readonly runId: RunId;
    readonly hint?: string;
}

export interface IObservationSampler {
    sample(request: SampleRequest): Promise<ObservationFrame>;
}
