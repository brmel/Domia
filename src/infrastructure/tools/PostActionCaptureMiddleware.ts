import { z } from 'zod';
import type { IAppAutomation } from '@domain/ports';
import { formatElements, type ToolSpec } from './ToolSpec';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { IPerceptionPipeline } from '@domain/ports';

const CAPTURE_SKIPPED: Record<string, unknown> = { status: 'success', capture: 'skipped' };

const captureSchema = {
    capture: z.boolean().optional().describe('If false, skip post-action page capture. Default true.'),
    captureDelayMs: z.number().int().nonnegative().optional().describe('Ms to wait before capturing (animations/network). Default 0.'),
};

export class PostActionCaptureMiddleware {
    constructor(
        private readonly automation: IAppAutomation,
        private readonly perception: IPerceptionPipeline,
        private readonly vision: boolean,
        private readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>,
    ) {}

    async capture(delayMs?: number, visionOverride?: boolean): Promise<Record<string, unknown>> {
        if (delayMs && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        await this.automation.waitForDOMStable();

        const useVision = visionOverride ?? this.vision;
        const frameResult = await this.perception.capture(this.automation, { dom: true, aria: true, vision: useVision });

        if (frameResult.isErr()) {
            return { status: 'error', error: `Perception capture failed: ${frameResult.error.message}` };
        }

        const frame = frameResult.value;

        if (this.onCapture) {
            try { await this.onCapture(frame); } catch { /* persistence must not break agent loop */ }
        }

        const viewport = await this.automation.getViewportSize();

        const result: Record<string, unknown> = {
            status: 'success',
            currentUrl: frame.metadata.url,
            pageTitle: frame.metadata.title,
            viewport: `${viewport.width}x${viewport.height}`,
            elementCount: frame.semantic.dom.elements.length,
            elements: formatElements(frame.semantic.dom.elements),
        };

        if (useVision && frame.vision.primaryScreenshot) {
            result['screenshot'] = {
                base64: frame.vision.primaryScreenshot.toString('base64'),
                mimeType: frame.vision.mimeType,
            };
        }

        return result;
    }

    wrap(spec: ToolSpec): ToolSpec {
        if (!spec.capturable) return spec;

        return {
            ...spec,
            parameters: z.object({ ...spec.parameters.shape, ...captureSchema }),
            execute: async (args: Record<string, unknown>) => {
                const result = await Promise.resolve(spec.execute(args));
                if (result['status'] === 'error') return result;
                if (args['capture'] === false) return CAPTURE_SKIPPED;
                return this.capture(args['captureDelayMs'] as number | undefined);
            },
        };
    }
}
