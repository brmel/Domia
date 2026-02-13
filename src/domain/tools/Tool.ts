
import { ILogger, IExecutionController } from '../ports';
import { IAppDriver } from '../ports/IAppDriver';
import type { PlatformType } from './ToolMetadata';

/**
 * Platform-specific context information
 */
export interface PlatformContext {
    /** For Electron: window IDs, CDP connection details */
    electron?: {
        windowId?: string;
        cdpEndpoint?: string;
        windows?: Array<{ id: string; title: string }>;
    };
    
    /** For Web: browser context, extensions, tabs */
    web?: {
        browserContext?: string;
        extensions?: string[];
        tabId?: string;
    };
    
    /** For Mobile: device info, orientation */
    mobile?: {
        deviceId?: string;
        orientation?: 'portrait' | 'landscape';
        platform?: 'ios' | 'android';
    };
}

/**
 * Context passed to every tool execution.
 * Contains everything a tool needs to execute within a platform
 */
export interface ToolContext {
    /** Unified driver interface (required for new tools) */
    driver: IAppDriver;
    
    /** Current platform (required for polymorphic tools) */
    platform: PlatformType;
    
    /** Platform-specific metadata and context */
    platformContext?: PlatformContext;
    
    /** Logger for debugging and tracing */
    logger?: ILogger;
    
    /** Execution controller for cancellation */
    controller?: IExecutionController;
}

