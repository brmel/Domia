import { z } from 'zod';
import type { ActionType } from '@domain/enums/ActionType';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { ActionRecordingData } from '@domain/types/ActionRecordingTypes';
import type { ActionRecordingOptions } from '../recording/ActionRecordingService';
import type { ShellExecutor } from '../shell/ShellExecutor';
import type { ElectronWindowManager } from '../drivers/ElectronWindowManager';

export interface ToolSpec {
    readonly name: string;
    readonly category?: string;
    readonly description: string;
    readonly actionType: ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    readonly platforms?: readonly PlatformType[];
    readonly isLongRunning?: boolean;
    readonly execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface RecordingConfig {
    readonly enabled: boolean;
    readonly options?: ActionRecordingOptions;
}

export interface ToolDependencies {
    readonly automation: IStructuredAutomation;
    readonly perception: IPerceptionPipeline;
    readonly perceptionSource: IPerceptionSource;
    readonly vision: boolean;
    readonly platform?: PlatformType | undefined;
    readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>;
    readonly recording?: RecordingConfig;
    readonly onRecording?: (recording: ActionRecordingData) => void | Promise<void>;
    readonly shellExecutor?: ShellExecutor;
    readonly windowManager?: ElectronWindowManager;
}
