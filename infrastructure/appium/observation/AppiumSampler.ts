import type { IObservationSampler, SampleRequest } from '@domain/ports/perception/IObservationSampler';
import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';

export class AppiumSampler implements IObservationSampler {
    async sample(request: SampleRequest): Promise<ObservationFrame> {
        return {
            runId: request.runId,
            capturedAt: Date.now(),
            source: 'appium.sampler',
            summary: 'Appium sampler scaffold — accessibility-tree capture not yet implemented',
            attachments: [],
        };
    }
}
