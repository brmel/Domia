import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import type { IStructuredAutomation } from '@domain/ports/IAppAutomation';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { MediaAttachment } from '@domain/value-objects/MediaAttachment';
import type { IPerceptionPipeline } from '@domain/ports';
import { sleep } from '@shared/reliability/sleep';
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

    consumeMedia(): MediaAttachment[] {
        const media = this._pendingMedia;
        this._pendingMedia = [];
        return media;
    }

    async capture(delayMs?: number, visionOverride?: boolean): Promise<Record<string, unknown>> {
        if (delayMs && delayMs > 0) await sleep(delayMs);

        const useVision = this.vision && (visionOverride ?? true);
        const frameResult = await this.perception.capture(this.perceptionSource, { aria: true, vision: useVision });

        if (frameResult.isErr()) {
            return toolError(`Perception capture failed: ${frameResult.error.message}`);
        }

        const frame = frameResult.value;
        this.automation.updateRefs(frame.semantic.refs);
        await this.onCapture?.(frame)?.catch?.(() => {});

        if (useVision && frame.vision.screenshots.length > 0) {
            this._pendingMedia = frame.vision.screenshots.map(buf => ({
                type: 'image' as const,
                data: buf,
                mimeType: frame.vision.mimeType,
            }));
        }

        return this.buildResult(frame, useVision);
    }

    private buildResult(frame: PerceptionFrame, useVision: boolean): Record<string, unknown> {
        const result: Record<string, unknown> = {
            status: TOOL_SUCCESS,
            currentUrl: frame.metadata.url,
            pageTitle: frame.metadata.title,
            elementCount: Object.keys(frame.semantic.refs).length,
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
