import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { formatInteractiveNodes } from './formatInteractiveNodes';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { IPerceptionPipeline } from '@domain/ports';

/**
 * Provides on-demand perception capture for the `observe` tool.
 * No longer wraps action tools — the agent explicitly calls `observe` when it needs page state.
 */
export class PostActionCaptureMiddleware {
    constructor(
        private readonly perceptionSource: IPerceptionSource,
        private readonly perception: IPerceptionPipeline,
        private readonly vision: boolean,
        private readonly maxElements: number = 50,
        private readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>,
    ) {}

    async capture(delayMs?: number, visionOverride?: boolean): Promise<Record<string, unknown>> {
        if (delayMs && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const useVision = visionOverride ?? this.vision;
        const frameResult = await this.perception.capture(this.perceptionSource, { dom: true, aria: true, vision: useVision });

        if (frameResult.isErr()) {
            return { status: 'error', error: `Perception capture failed: ${frameResult.error.message}` };
        }

        const frame = frameResult.value;

        if (this.onCapture) {
            try { await this.onCapture(frame); } catch { /* persistence must not break agent loop */ }
        }

        const result: Record<string, unknown> = {
            status: 'success',
            currentUrl: frame.metadata.url,
            pageTitle: frame.metadata.title,
            elementCount: frame.semantic.dom.elements.length,
            elements: formatInteractiveNodes(frame.semantic.dom.elements, this.maxElements),
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
