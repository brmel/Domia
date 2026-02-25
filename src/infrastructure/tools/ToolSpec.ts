import { z } from 'zod';
import type { ActionType } from '@domain/enums/ActionType';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { IAppAutomation, IPerceptionPipeline } from '@domain/ports';
import type { DOMElement } from '@domain/value-objects/DOMSnapshot';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';

export interface ToolSpec {
    readonly name: string;
    readonly description: string;
    readonly actionType: ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    readonly platforms?: readonly PlatformType[];
    readonly capturable: boolean;
    readonly execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface ToolDependencies {
    readonly automation: IAppAutomation;
    readonly perception: IPerceptionPipeline;
    readonly vision: boolean;
    readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>;
}

export function formatElements(elements: readonly DOMElement[], limit = 50): string {
    return elements
        .slice(0, limit)
        .map((el) => {
            const attrs = Object.entries(el.attributes)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
            const bbox = el.boundingBox
                ? `[x:${Math.round(el.boundingBox.x)},y:${Math.round(el.boundingBox.y)},w:${Math.round(el.boundingBox.width)},h:${Math.round(el.boundingBox.height)}]`
                : '';
            return `[${el.id}] <${el.tag} ${attrs}>${el.text.slice(0, 50)}</${el.tag}> ${bbox}`;
        })
        .join('\n');
}
