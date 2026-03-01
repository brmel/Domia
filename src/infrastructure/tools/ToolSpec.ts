import { z } from 'zod';
import type { ActionType } from '@domain/enums/ActionType';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';

export interface ToolSpec {
    readonly name: string;
    readonly description: string;
    readonly actionType: ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    readonly platforms?: readonly PlatformType[];
    readonly execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface ToolDependencies {
    readonly automation: IStructuredAutomation;
    readonly perception: IPerceptionPipeline;
    readonly perceptionSource: IPerceptionSource;
    readonly vision: boolean;
    readonly maxElements?: number;
    readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>;
}
