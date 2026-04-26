import type { IAppDriver } from './IAppDriver';
import type { PlatformConfig, PlatformType } from '../types/PlatformConfig';

export interface AppDriverCreateOptions {
    headless?: boolean;
    maxSteps?: number;
    vision?: boolean;
    debugScreenshots?: boolean;
}

export interface AppDriverCreateConfig {
    readonly platformConfig: PlatformConfig;
    readonly options?: AppDriverCreateOptions;
}

export interface IAppDriverProvider {
    readonly platform: PlatformType;
    createDriver(config: AppDriverCreateConfig): Promise<IAppDriver>;
}

export interface IAppDriverFactory {
    createDriver(config: AppDriverCreateConfig): Promise<IAppDriver>;
    registerProvider(provider: IAppDriverProvider): void;
}