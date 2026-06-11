import { z } from 'zod';
import type { ToolNameValue, ToolCategory, ToolResult } from '@domain/types/ToolTypes';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource, ILogger } from '@domain/ports';
import type { AppCapabilities } from '@domain/ports/automation/IAppDriver';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { ActionRecordingData } from '@domain/types/ActionRecordingTypes';
import type { ActionRecordingOptions } from '../ActionRecordingService';
import type { ShellExecutor } from '../shell/ShellExecutor';
import type { IShellPolicy } from '@domain/ports/automation/IShellPolicy';
import type { IWindowManager } from '@domain/ports/automation/IWindowManager';
import type { ITabManager } from '@domain/ports/automation/ITabManager';
import type { IObservationCoordinator } from '@domain/ports/perception/IObservationCoordinator';

export interface ToolSpec {
    readonly name: ToolNameValue;
    readonly category?: ToolCategory;
    readonly description: string;
    readonly actionType: import('@domain/enums').ActionType;
    readonly parameters: z.ZodObject<z.ZodRawShape>;
    readonly platforms?: readonly PlatformType[];
    /** Capability requirements gated against AppCapabilities at catalog-build time, so a tool is never offered where it can't run. */
    readonly requires?: {
        readonly dom?: boolean;
        readonly nativeInteraction?: boolean;
        readonly vision?: boolean;
    };
    readonly isLongRunning?: boolean;
    readonly execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

interface RecordingConfig {
    readonly enabled: boolean;
    readonly options?: ActionRecordingOptions;
}

export interface ToolDependencies {
    readonly automation: IStructuredAutomation;
    readonly logger: ILogger;
    readonly perception: IPerceptionPipeline;
    readonly perceptionSource: IPerceptionSource;
    readonly vision: boolean;
    readonly platform?: PlatformType | undefined;
    readonly capabilities?: AppCapabilities | undefined;
    readonly onCapture?: (frame: PerceptionFrame) => void | Promise<void>;
    readonly recording?: RecordingConfig;
    readonly onRecording?: (recording: ActionRecordingData) => void | Promise<void>;
    readonly shellExecutor?: ShellExecutor;
    readonly shellPolicy?: IShellPolicy;
    readonly windowManager?: IWindowManager;
    readonly tabManager?: ITabManager;
    readonly observation?: IObservationCoordinator;
    readonly runId?: string;
    readonly onSuspendRequest?: (reason: string) => void;
}
