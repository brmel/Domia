import { z } from 'zod';
import type { ToolName, ToolCategory, ToolResult } from '@domain/types/ToolTypes';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { ActionRecordingData } from '@domain/types/ActionRecordingTypes';
import type { ActionRecordingOptions } from '../recording/ActionRecordingService';
import type { ShellExecutor } from '../shell/ShellExecutor';
import type { IShellPolicy } from '@domain/ports/IShellPolicy';
import type { ElectronWindowManager } from '../drivers/ElectronWindowManager';
import type { ITabManager } from '@domain/ports/ITabManager';

export interface ToolSpec {
    /** Unique tool identifier. Built-in names autocomplete; plugins may add any string. */
    readonly name: ToolName;
    /** Semantic grouping — used for docs and recording opt-in. */
    readonly category?: ToolCategory;
    readonly description: string;
    readonly actionType: import('@domain/enums/ActionType').ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    readonly platforms?: readonly PlatformType[];
    readonly isLongRunning?: boolean;
    readonly execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
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
    readonly shellPolicy?: IShellPolicy;
    readonly windowManager?: ElectronWindowManager;
    readonly tabManager?: ITabManager;
}
