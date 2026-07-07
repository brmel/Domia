import type { PlatformConfig } from '@domain/types/PlatformConfig';
import { Platform } from '@domain/value-objects';

interface PlatformOptions {
    url?: string;
    platform?: string;
    cdpUrl?: string;
    executablePath?: string;
    launchArgs?: string[];
    windowTitle?: string;
}

type ResolvedPlatform = 'web' | 'electron-cdp' | 'electron-exec' | 'unspecified';

function resolvePlatform(opts: PlatformOptions): ResolvedPlatform {
    if (opts.url) return 'web';
    if (opts.cdpUrl) return 'electron-cdp';
    if (opts.executablePath) return 'electron-exec';
    return 'unspecified';
}

export function buildPlatformConfig(
    options: PlatformOptions,
    defaultPlatformConfig?: PlatformConfig,
): PlatformConfig {
    const { url, platform, cdpUrl, executablePath, launchArgs, windowTitle } = options;

    switch (resolvePlatform(options)) {
        case 'web':
            return { platform: Platform.Web, url: url! };

        case 'electron-cdp':
            return {
                platform: Platform.Electron,
                connection: {
                    type: 'cdp',
                    cdpUrl: cdpUrl!,
                    ...(windowTitle ? { windowTitle } : {}),
                },
            };

        case 'electron-exec':
            return {
                platform: Platform.Electron,
                connection: {
                    type: 'executable',
                    executablePath: executablePath!,
                    ...(launchArgs?.length ? { launchArgs } : {}),
                    ...(windowTitle ? { windowTitle } : {}),
                },
            };

        case 'unspecified':
            if (defaultPlatformConfig) return defaultPlatformConfig;
            if (platform === Platform.Electron) {
                throw new Error('Electron platform requires --cdp-url or --executable-path.');
            }
            throw new Error('Must provide one of --url, --cdp-url, or --executable-path.');
    }
}
