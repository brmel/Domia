import { ResultAsync } from 'neverthrow';
import { ToolDefinition } from '../tools';
import { AppSnapshot } from '../value-objects/AppSnapshot';
import { NavigationError } from '../errors';
import { Platform } from '../constants/PlatformConstants';

export interface AppCapabilities {
    readonly platform: Platform;
    readonly supportsDOM: boolean;
    readonly supportsVision: boolean;
    readonly supportsMultiWindow: boolean;
    readonly supportsNativeInteraction: boolean;
}

/** Unified interface for driving any application (Web, Electron, Mobile). */
export interface IAppDriver {
    connect(config?: unknown): ResultAsync<void, NavigationError | Error>;
    disconnect(): Promise<void>;
    getCapabilities(): AppCapabilities;
    captureSnapshot(): Promise<AppSnapshot>;
    getTools(): ToolDefinition[];
    getBrowserAutomation(): import('./IBrowserAutomation').IBrowserAutomation;
}
