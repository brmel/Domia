import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import type { IStructuredAutomation } from '@domain/ports/IAppAutomation';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { MediaAttachment } from '@domain/value-objects/MediaAttachment';
import type { IPerceptionPipeline } from '@domain/ports';
import { toolError, TOOL_SUCCESS } from './toolResult';

export class PostActionCaptureMiddleware {
    private _pendingMedia: MediaAttachment[] = [];

    constructor(
        private readonly perceptionSource: IPerceptionSource,
        private readonly perception: IPerceptionPipeline,
        private readonly automation: IStructuredAutomation,
        private readonly vision: boolean,
        private readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>,
    ) {}

    /**
     * Drain any buffered media from the last capture.
     * Called by the agent runner to inject images into the LLM conversation.
     */
    consumeMedia(): MediaAttachment[] {
        const media = this._pendingMedia;
        this._pendingMedia = [];
        return media;
    }

    async capture(delayMs?: number, visionOverride?: boolean): Promise<Record<string, unknown>> {
        if (delayMs && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const useVision = visionOverride ?? this.vision;
        const frameResult = await this.perception.capture(this.perceptionSource, { aria: true, vision: useVision });

        if (frameResult.isErr()) {
            return toolError(`Perception capture failed: ${frameResult.error.message}`);
        }

        const frame = frameResult.value;
        this.automation.updateRefs(frame.semantic.refs);

        if (this.onCapture) {
            try { await this.onCapture(frame); } catch { /* persistence must not break agent loop */ }
        }

        // Buffer screenshots for LLM injection by the agent runner
        if (useVision && frame.vision.screenshots.length > 0) {
            this._pendingMedia = frame.vision.screenshots.map(buf => ({
                type: 'image' as const,
                data: buf,
                mimeType: frame.vision.mimeType,
            }));
        }

        const refCount = Object.keys(frame.semantic.refs).length;
        const result: Record<string, unknown> = {
            status: TOOL_SUCCESS,
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
