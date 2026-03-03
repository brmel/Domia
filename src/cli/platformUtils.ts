import type { Command } from 'commander';
import type { PlatformConfig } from '../domain/types/PlatformConfig';

export function addPlatformOptions(cmd: Command): Command {
    return cmd
        .option('-u, --url <url>', 'Target URL for web platform')
        .option('--cdp-url <cdpUrl>', 'CDP URL for Electron (e.g., http://localhost:9222)')
        .option('--executable-path <path>', 'Path to Electron executable')
        .option('--launch-args <args>', 'Launch arguments for Electron (comma-separated)')
        .option('--window-title <title>', 'Target window title (Electron)');
}

export function buildPlatformConfig(
    options: {
        url?: string;
        cdpUrl?: string;
        executablePath?: string;
        launchArgs?: string;
        windowTitle?: string;
    },
    defaultPlatformConfig?: PlatformConfig,
): PlatformConfig {
    const { url, cdpUrl, executablePath, launchArgs, windowTitle } = options;

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

    if (defaultPlatformConfig) {
        return defaultPlatformConfig;
    }

    throw new Error('Must provide one of --url, --cdp-url, or --executable-path.');
}
