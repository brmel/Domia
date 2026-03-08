import type { PlatformConfig } from '../domain/types/PlatformConfig';

export function buildPlatformConfig(
    options: {
        url?: string;
        platform?: string;
        cdpUrl?: string;
        executablePath?: string;
        launchArgs?: string[];
        windowTitle?: string;
        appPackage?: string;
        bundleId?: string;
        appiumUrl?: string;
        deviceSerial?: string;
        deviceUdid?: string;
    },
    defaultPlatformConfig?: PlatformConfig,
): PlatformConfig {
    const { url, platform, cdpUrl, executablePath, launchArgs, windowTitle, appPackage, bundleId, appiumUrl, deviceSerial, deviceUdid } = options;

    if (url) {
        return { platform: 'web', url };
    }

    if (cdpUrl || platform === 'electron') {
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
                    ...(launchArgs?.length ? { launchArgs } : {}),
                    ...(windowTitle ? { windowTitle } : {}),
                },
            };
        }
        throw new Error('Electron platform requires --cdp-url or --executable-path.');
    }

    if (executablePath) {
        return {
            platform: 'electron',
            connection: {
                type: 'executable',
                executablePath,
                ...(launchArgs?.length ? { launchArgs } : {}),
                ...(windowTitle ? { windowTitle } : {}),
            },
        };
    }

    if (appPackage || platform === 'android') {
        if (!appPackage) throw new Error('Android platform requires --app-package.');
        return {
            platform: 'android',
            appPackage,
            ...(appiumUrl ? { appiumUrl } : {}),
            ...(deviceSerial ? { deviceSerial } : {}),
        };
    }

    if (bundleId || platform === 'ios') {
        if (!bundleId) throw new Error('iOS platform requires --bundle-id.');
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
