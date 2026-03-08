import { ResultAsync } from 'neverthrow';
import { NavigationError } from '../errors';
import type { BuiltInPlatformType } from '../types/PlatformConfig';

export interface AppCapabilities {
    readonly platform: BuiltInPlatformType;
    readonly supportsDOM: boolean;
    readonly supportsVision: boolean;
    readonly supportsMultiWindow: boolean;
    readonly supportsNativeInteraction: boolean;
}

export interface IAppDriver {
    connect(config?: unknown): ResultAsync<void, NavigationError | Error>;
    disconnect(): Promise<void>;
    getCapabilities(): AppCapabilities;
    getAutomation(): import('./IAppAutomation').IStructuredAutomation;
    getBrowserWsEndpoint(): string | null;
}
