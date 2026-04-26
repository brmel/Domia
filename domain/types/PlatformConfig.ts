export type BuiltInPlatformType = 'web' | 'electron';

export type PlatformType = BuiltInPlatformType | (string & {});

export interface BasePlatformConfig {
    platform: PlatformType;
}

export interface WebPlatformConfig extends BasePlatformConfig {
    platform: 'web';
    url: string;
}

export interface ElectronCDPConnection {
    type: 'cdp';
    cdpUrl: string;
    windowTitle?: string;
}

export interface ElectronExecutableConnection {
    type: 'executable';
    executablePath: string;
    launchArgs?: string[];
    cdpPort?: number;
    windowTitle?: string;
}

export type ElectronConnection = ElectronCDPConnection | ElectronExecutableConnection;

export interface ElectronPlatformConfig extends BasePlatformConfig {
    platform: 'electron';
    connection: ElectronConnection;
    startUrl?: string;
}

export type PlatformConfig = WebPlatformConfig | ElectronPlatformConfig;
