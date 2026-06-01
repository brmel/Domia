import type { IObservationSampler, SampleRequest } from '@domain/ports/perception/IObservationSampler';
import type { IPerceptionSource } from '@domain/ports/perception/IPerceptionSource';
import type { ObservationFrame, FrameAttachment } from '@domain/value-objects/ObservationFrame';

const MAX_SUMMARY_CHARS = 4000;

/**
 * Real Appium observation sampler (W7). Produces a frame from the native
 * accessibility snapshot (truncated) plus an inline screenshot attachment when a
 * perception source is available. Falls back to a clear note if perception is absent.
 */
export class AppiumSampler implements IObservationSampler {
    constructor(private readonly perceptionSource: IPerceptionSource | null = null) {}

    async sample(request: SampleRequest): Promise<ObservationFrame> {
        const base = { runId: request.runId, capturedAt: Date.now(), source: 'appium.sampler' };

        if (!this.perceptionSource) {
            return { ...base, summary: 'Appium perception source unavailable (no active session).', attachments: [] };
        }

        let summary = '';
        try {
            summary = (await this.perceptionSource.getAriaSnapshot()).slice(0, MAX_SUMMARY_CHARS);
        } catch (e) {
            summary = `Failed to capture accessibility snapshot: ${e instanceof Error ? e.message : String(e)}`;
        }

        const attachments: FrameAttachment[] = [];
        try {
            const buf = await this.perceptionSource.captureScreenshot();
            attachments.push({
                id: `${request.runId}-screen-${base.capturedAt}`,
                contentType: 'image/png',
                inline: buf.toString('base64'),
                bytes: buf.length,
            });
        } catch {
            /* screenshot is best-effort */
        }

        return { ...base, summary, attachments };
    }
}
