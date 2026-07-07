import type { MobileDevicePreset } from '@shared/contracts/platform';
import type { PlatformType } from '../value-objects/Platform';

export type { BuiltInPlatformType, PlatformType } from '../value-objects/Platform';

export interface BasePlatformConfig {
    platform: PlatformType;
}

export interface WebPlatformConfig extends BasePlatformConfig {
    platform: 'web';
    url: string;
    device?: MobileDevicePreset;
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

export interface MobileIosCapabilities {
    os: 'ios';
    bundleId: string;
    deviceName: string;
    platformVersion: string;
    udid?: string;
}

export interface MobileAndroidCapabilities {
    os: 'android';
    appPackage: string;
    appActivity: string;
    deviceName: string;
    platformVersion: string;
}

export type MobileCapabilities = MobileIosCapabilities | MobileAndroidCapabilities;

export interface MobilePlatformConfig extends BasePlatformConfig {
    platform: 'mobile';
    appiumServerUrl: string;
    capabilities: MobileCapabilities;
}

export type PlatformConfig = WebPlatformConfig | ElectronPlatformConfig | MobilePlatformConfig;
