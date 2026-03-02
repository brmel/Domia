import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import type { IStructuredAutomation } from '@domain/ports/IAppAutomation';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { IPerceptionPipeline } from '@domain/ports';

export class PostActionCaptureMiddleware {
    constructor(
        private readonly perceptionSource: IPerceptionSource,
        private readonly perception: IPerceptionPipeline,
        private readonly automation: IStructuredAutomation,
        private readonly vision: boolean,
        private readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>,
    ) {}

    async capture(delayMs?: number, visionOverride?: boolean): Promise<Record<string, unknown>> {
        if (delayMs && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const useVision = visionOverride ?? this.vision;
        const frameResult = await this.perception.capture(this.perceptionSource, { aria: true, vision: useVision });

        if (frameResult.isErr()) {
            return { status: 'error', error: `Perception capture failed: ${frameResult.error.message}` };
        }

        const frame = frameResult.value;
        this.automation.updateRefs(frame.semantic.refs);

        if (this.onCapture) {
            try { await this.onCapture(frame); } catch { /* persistence must not break agent loop */ }
        }

        const refCount = Object.keys(frame.semantic.refs).length;
        const result: Record<string, unknown> = {
            status: 'success',
            currentUrl: frame.metadata.url,
            pageTitle: frame.metadata.title,
            elementCount: refCount,
            elements: frame.semantic.ariaSnapshot,
        };

        if (useVision && frame.vision.primaryScreenshot) {
            result['screenshot'] = {
                captured: true,
                mimeType: frame.vision.mimeType,
                count: frame.vision.screenshots?.length ?? 1,
            };
        }

        return result;
    }
}
