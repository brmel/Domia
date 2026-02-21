
import { ILogger, IExecutionController } from '../ports';
import { IAppDriver } from '../ports/IAppDriver';
import type { PlatformType } from './ToolMetadata';

export interface PlatformContext {
    electron?: {
        windowId?: string;
        cdpEndpoint?: string;
        windows?: Array<{ id: string; title: string }>;
    };
}

export interface ToolContext {
    driver: IAppDriver;
    platform: PlatformType;
    platformContext?: PlatformContext;
    logger?: ILogger;
    controller?: IExecutionController;
}

