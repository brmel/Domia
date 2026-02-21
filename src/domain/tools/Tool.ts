
import { ILogger, IExecutionController } from '../ports';
import { IAppDriver } from '../ports/IAppDriver';
import type { PlatformType } from './ToolMetadata';

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

export interface ToolContext {
    driver: IAppDriver;
    platform: PlatformType;
    platformContext?: PlatformContext;
    logger?: ILogger;
    controller?: IExecutionController;
}

