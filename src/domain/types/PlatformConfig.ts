export type BuiltInPlatformType = 'web' | 'electron' | 'android' | 'ios';

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

export type ElectronConnection = 
  | ElectronCDPConnection 
  | ElectronExecutableConnection;

export interface ElectronPlatformConfig extends BasePlatformConfig {
  platform: 'electron';
  connection: ElectronConnection;
  startUrl?: string;
}

export interface AndroidPlatformConfig extends BasePlatformConfig {
  platform: 'android';
  /** App package identifier, e.g. com.example.app */
  appPackage: string;
  /** Optional Appium server URL. Defaults to http://localhost:4723. */
  appiumUrl?: string;
  /** Optional device serial for adb / Appium. */
  deviceSerial?: string;
}

export interface IosPlatformConfig extends BasePlatformConfig {
  platform: 'ios';
  /** Bundle identifier, e.g. com.example.App */
  bundleId: string;
  /** Optional Appium server URL. Defaults to http://localhost:4723. */
  appiumUrl?: string;
  /** Optional device UDID for Xcode / Appium. */
  deviceUdid?: string;
}

export type PlatformConfig = 
  | WebPlatformConfig 
  | ElectronPlatformConfig
  | AndroidPlatformConfig
  | IosPlatformConfig;
