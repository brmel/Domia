import type { Command } from 'commander';
import type { PlatformConfig } from '../domain/types/PlatformConfig';

export function addPlatformOptions(cmd: Command): Command {
    return cmd
        .option('-u, --url <url>', 'Target URL for web platform')
        .option('--cdp-url <cdpUrl>', 'CDP URL for Electron (e.g., http://localhost:9222)')
        .option('--executable-path <path>', 'Path to Electron executable')
        .option('--launch-args <args>', 'Launch arguments for Electron (comma-separated)')
        .option('--window-title <title>', 'Target window title (Electron)')
        .option('--app-package <package>', 'Android app package (e.g. com.example.app)')
        .option('--bundle-id <id>', 'iOS bundle identifier (e.g. com.example.App)')
        .option('--appium-url <url>', 'Appium server URL (default: http://localhost:4723)')
        .option('--device-serial <serial>', 'Android device serial (adb devices)')
        .option('--device-udid <udid>', 'iOS device UDID');
}

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
