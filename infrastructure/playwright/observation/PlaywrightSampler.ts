import type { IObservationSampler, SampleRequest } from '@domain/ports/perception/IObservationSampler';
import type { IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import type { ObservationFrame, FrameAttachment } from '@domain/value-objects/ObservationFrame';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { SnapshotError } from '@domain/errors';

const ATTACHMENT_ARIA = 'aria';
const ATTACHMENT_SCREENSHOT = 'screenshot';

const ARIA_PREVIEW_CHARS = 320;

export class PlaywrightSampler implements IObservationSampler {
    constructor(
        private readonly pipeline: IPerceptionPipeline,
        private readonly source: IPerceptionSource,
        private readonly visionEnabled: boolean,
    ) {}

    async sample(request: SampleRequest): Promise<ObservationFrame> {
        const result = await this.pipeline.capture(this.source, { vision: this.visionEnabled });
        if (result.isErr()) {
            throw new SnapshotError(`Sampler capture failed: ${result.error.message}`);
        }
        const frame = result.value;
        return {
            runId: request.runId,
            capturedAt: frame.timestamp,
            source: 'playwright.sampler',
            summary: this.summarize(frame),
            attachments: this.attachmentsFor(frame),
        };
    }

    private summarize(frame: PerceptionFrame): string {
        const url = frame.metadata.url;
        const title = frame.metadata.title || '(no title)';
        const refCount = Object.keys(frame.semantic.refs).length;
        return `${url} — ${title} — ${refCount} refs`;
    }

    private attachmentsFor(frame: PerceptionFrame): readonly FrameAttachment[] {
        const out: FrameAttachment[] = [];
        if (frame.semantic.ariaSnapshot) {
            const inline = frame.semantic.ariaSnapshot.slice(0, ARIA_PREVIEW_CHARS);
            out.push({
                id: ATTACHMENT_ARIA,
                contentType: 'text/plain',
                inline,
                bytes: Buffer.byteLength(frame.semantic.ariaSnapshot, 'utf8'),
            });
        }
        const firstScreenshot = frame.vision.screenshots[0];
        if (firstScreenshot) {
            out.push({
                id: ATTACHMENT_SCREENSHOT,
                contentType: 'image/jpeg',
                bytes: firstScreenshot.length,
            });
        }
        return out;
    }
}
