import type { PlatformConfig } from '../domain/types/PlatformConfig';

export function buildPlatformConfig(
    options: {
        url?: string;
        cdpUrl?: string;
        executablePath?: string;
        launchArgs?: string;
        windowTitle?: string;
        appPackage?: string;
        bundleId?: string;
        appiumUrl?: string;
        deviceSerial?: string;
        deviceUdid?: string;
    },
    defaultPlatformConfig?: PlatformConfig,
): PlatformConfig {
    const { url, cdpUrl, executablePath, launchArgs, windowTitle, appPackage, bundleId, appiumUrl, deviceSerial, deviceUdid } = options;

    if (url) {
        return { platform: 'web', url };
    }

    if (cdpUrl) {
        return {
            platform: 'electron',
            connection: {
                type: 'cdp',
                cdpUrl,
                ...(windowTitle ? { windowTitle } : {}),
            },
        };
    }

    if (executablePath) {
        return {
            platform: 'electron',
            connection: {
                type: 'executable',
                executablePath,
                ...(launchArgs ? { launchArgs: launchArgs.split(',').map((arg) => arg.trim()).filter(Boolean) } : {}),
                ...(windowTitle ? { windowTitle } : {}),
            },
        };
    }

    if (appPackage) {
        return {
            platform: 'android',
            appPackage,
            ...(appiumUrl ? { appiumUrl } : {}),
            ...(deviceSerial ? { deviceSerial } : {}),
        };
    }

    if (bundleId) {
        return {
            platform: 'ios',
            bundleId,
            ...(appiumUrl ? { appiumUrl } : {}),
            ...(deviceUdid ? { deviceUdid } : {}),
        };
    }

    if (defaultPlatformConfig) {
        return defaultPlatformConfig;
    }

    throw new Error('Must provide one of --url, --cdp-url, --executable-path, --app-package, or --bundle-id.');
}
