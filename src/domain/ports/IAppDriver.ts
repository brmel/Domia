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

/**
 * IAppDriver Port
 * 
 * The unified interface for driving any application (Web, Electron, Mobile).
 * It decouples the Agent from the specific automation technology (Playwright, Appium, CDP).
 */
export interface IAppDriver {
    /**
     * Connects to the target application.
     * - Web: Launches browser or connects to existing.
     * - Electron: Connects via CDP port.
     */
    connect(config?: unknown): ResultAsync<void, NavigationError | Error>;

    /**
     * Disconnects/Closes the session.
     */
    disconnect(): Promise<void>;

    /**
     * Returns the capabilities of this driver.
     */
    getCapabilities(): AppCapabilities;

    /**
     * captureSnapshot
     * Returns the current state of the application (Visual + Structural).
     */
    captureSnapshot(): Promise<AppSnapshot>;

    /**
     * getTools
     * Returns the list of tools this driver supports.
     */
    getTools(): ToolDefinition[];

    /**
     * getBrowserAutomation
     * Returns the underlying IBrowserAutomation interface used by current execution services.
     */
    getBrowserAutomation(): import('./IBrowserAutomation').IBrowserAutomation;
}
