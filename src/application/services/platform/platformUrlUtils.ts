import type { PlatformConfig } from '@domain/types/PlatformConfig';

/**
 * Derive a canonical execution URL from a PlatformConfig.
 * Centralises the platform→URL mapping used by RunCoordinator and PlatformSessionFactory.
 */
export function resolveUrlFromConfig(config: PlatformConfig): string {
    switch (config.platform) {
        case 'web':
            return config.url;
        case 'electron':
            if (config.startUrl) return config.startUrl;
            return config.connection.type === 'cdp'
                ? config.connection.cdpUrl
                : 'electron://app';
        case 'android':
            return `android://${config.appPackage}`;
        case 'ios':
            return `ios://${config.bundleId}`;
    }
}

/**
 * Build a unique lane-key for concurrency control from a PlatformConfig.
 */
export function resolveLaneKeyFromConfig(config: PlatformConfig): string {
    switch (config.platform) {
        case 'web':
            return `platform:web:${config.url}`;
        case 'electron':
            return config.connection.type === 'cdp'
                ? `platform:electron:cdp:${config.connection.cdpUrl}`
                : `platform:electron:executable:${config.connection.executablePath}`;
        case 'android':
            return `platform:android:${config.appPackage}`;
        case 'ios':
            return `platform:ios:${config.bundleId}`;
    }
}
