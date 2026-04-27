import { z } from 'zod';
import type { ToolNameValue, ToolCategory, ToolResult } from '@domain/types/ToolTypes';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { ActionRecordingData } from '@domain/types/ActionRecordingTypes';
import type { ActionRecordingOptions } from '../ActionRecordingService';
import type { ShellExecutor } from '../shell/ShellExecutor';
import type { IShellPolicy } from '@domain/ports/IShellPolicy';
import type { ElectronWindowManager } from '@infrastructure/playwright/electron/ElectronWindowManager';
import type { ITabManager } from '@domain/ports/ITabManager';

export interface ToolSpec {
    readonly name: ToolNameValue;
    readonly category?: ToolCategory;
    readonly description: string;
    readonly actionType: import('@domain/enums').ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    readonly platforms?: readonly PlatformType[];
    readonly isLongRunning?: boolean;
    readonly execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

interface RecordingConfig {
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
    readonly shellPolicy?: IShellPolicy;
    readonly windowManager?: ElectronWindowManager;
    readonly tabManager?: ITabManager;
}
