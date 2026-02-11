
import { ResultAsync } from 'neverthrow';
import { ToolDefinition } from '../tools';
import { AppSnapshot } from '../value-objects/AppSnapshot';
import { NavigationError } from '../errors';

export interface AppCapabilities {
    readonly platform: 'web' | 'electron' | 'mobile';
    readonly supportsDOM: boolean; // Can we get a DOM tree?
    readonly supportsVision: boolean; // Can we take screenshots?
    readonly supportsMultiWindow: boolean; // specific to Electron/Desktop
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
    connect(config?: any): ResultAsync<void, NavigationError | Error>;

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
     * Returns the underlying IBrowserAutomation interface for backward compatibility.
     * This allows existing code that uses IBrowserAutomation to work with IAppDriver.
     * @deprecated This is a temporary bridge - prefer using IAppDriver methods directly
     */
    getBrowserAutomation(): import('./IBrowserAutomation').IBrowserAutomation;
}
