import type { PlatformConfig } from '@domain/types/PlatformConfig';

export function buildPlatformConfig(
    options: {
        url?: string;
        platform?: string;
        cdpUrl?: string;
        executablePath?: string;
        launchArgs?: string[];
        windowTitle?: string;
    },
    defaultPlatformConfig?: PlatformConfig,
): PlatformConfig {
    const { url, platform, cdpUrl, executablePath, launchArgs, windowTitle } = options;

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
                ...(launchArgs?.length ? { launchArgs } : {}),
                ...(windowTitle ? { windowTitle } : {}),
            },
        };
    }

    if (defaultPlatformConfig) {
        return defaultPlatformConfig;
    }

    if (platform === 'electron') {
        throw new Error('Electron platform requires --cdp-url or --executable-path.');
    }

    throw new Error('Must provide one of --url, --cdp-url, or --executable-path.');
}
