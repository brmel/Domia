/** Built-in platform types. Custom platforms can use any string. */
export type BuiltInPlatformType = 'web' | 'electron';

/**
 * Extensible platform type: built-in types get autocompletion,
 * but any string is accepted for custom platforms.
 */
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
  windowTitle?: string;
}

export type ElectronConnection = 
  | ElectronCDPConnection 
  | ElectronExecutableConnection;

export interface ElectronPlatformConfig extends BasePlatformConfig {
  platform: 'electron';
  connection: ElectronConnection;
}

export type PlatformConfig = 
  | WebPlatformConfig 
  | ElectronPlatformConfig;
